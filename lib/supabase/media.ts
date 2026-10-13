import "server-only"
import { lookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"
import { env } from "@/lib/env"
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import {
  mediaKindFromMime,
  requireUploadContentType,
} from "@/generation/upload-contract"
import { UserFacingError, NotFoundError } from "@/lib/errors"
import { readCapped, extensionFor } from "@/lib/storage"
import { probeMedia } from "@/lib/storage/probe"
import { createSupabaseServiceClient } from "./server"
import type { UploadView } from "@/lib/generations/view"

export const MEDIA_BUCKET = "brix-media"
const MAX_BYTES = 50 * 1024 * 1024
const uploadSchema = z.object({
  contentType: z.string(),
  size: z.number().int().positive().max(MAX_BYTES),
  name: z.string().min(1).max(200),
})
const ticketSchema = uploadSchema.extend({
  userId: z.uuid(),
  path: z.string(),
  expires: z.number(),
})

function hmac(value: string) {
  const key = process.env.API_KEY_ENCRYPTION_SECRET
  if (!key) throw new Error("Upload signing is not configured.")
  return createHmac("sha256", key).update(`brix-upload:${value}`).digest("hex")
}

export async function signedMediaUrl(
  path: string,
  userId: string
): Promise<string> {
  if (
    !path.startsWith(`${userId}/`) ||
    path.split("/").some((p) => p === "." || p === "..") ||
    !/^[a-zA-Z0-9._/-]+$/.test(path)
  )
    throw new NotFoundError("Media not found.")
  const { data, error } = await createSupabaseServiceClient()
    .storage.from(MEDIA_BUCKET)
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl)
    throw new UserFacingError("Couldn't open this media file.")
  return data.signedUrl
}

/** Resolve only paths in this user's bucket folder, never fetch a supplied URL. */
export function pathFromMediaUrl(value: string, userId: string): string {
  const url = new URL(value)
  const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
  const app = new URL(env().APP_URL)
  let path: string
  if (
    url.origin === supabase.origin &&
    url.pathname.startsWith(`/storage/v1/object/sign/${MEDIA_BUCKET}/`)
  )
    path = decodeURIComponent(
      url.pathname.slice(`/storage/v1/object/sign/${MEDIA_BUCKET}/`.length)
    )
  else if (url.origin === app.origin && url.pathname.startsWith("/api/media/"))
    path = decodeURIComponent(url.pathname.slice("/api/media/".length))
  else throw new NotFoundError("Media not found.")
  if (
    !path.startsWith(`${userId}/`) ||
    path.split("/").some((p) => p === "." || p === "..") ||
    !/^[a-zA-Z0-9._/-]+$/.test(path)
  )
    throw new NotFoundError("Media not found.")
  return path
}

export async function prepareUpload(userId: string, raw: unknown) {
  const input = uploadSchema.parse(raw)
  const contentType = requireUploadContentType(input.contentType)
  const path = `${userId}/uploads/${randomUUID()}.${extensionFor(contentType)}`
  const { data, error } = await createSupabaseServiceClient()
    .storage.from(MEDIA_BUCKET)
    .createSignedUploadUrl(path)
  if (error || !data) throw new UserFacingError("Couldn't prepare your upload.")
  const payload = Buffer.from(
    JSON.stringify({
      ...input,
      contentType,
      userId,
      path,
      expires: Date.now() + 15 * 60_000,
    })
  ).toString("base64url")
  return {
    ticket: {
      upload_url: data.signedUrl,
      public_url: `${env().APP_URL}/api/media/${path}`,
      content_type: contentType,
      upload_headers: {
        "content-type": contentType,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      },
    },
    token: `${payload}.${hmac(payload)}`,
  }
}

export async function finishUpload(
  userId: string,
  raw: unknown
): Promise<UploadView> {
  const input = uploadSchema
    .extend({ publicUrl: z.url(), token: z.string().max(4096) })
    .parse(raw)
  const [payload, signature] = input.token.split(".")
  if (
    !payload ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(
      Buffer.from(hmac(payload), "hex"),
      Buffer.from(signature, "hex")
    )
  )
    throw new UserFacingError("Invalid upload confirmation.")
  const ticket = ticketSchema.parse(
    JSON.parse(Buffer.from(payload, "base64url").toString())
  )
  if (
    ticket.userId !== userId ||
    ticket.expires < Date.now() ||
    ticket.contentType !== input.contentType ||
    ticket.size !== input.size ||
    pathFromMediaUrl(input.publicUrl, userId) !== ticket.path
  )
    throw new UserFacingError("Upload confirmation expired or mismatched.")
  const client = createSupabaseServiceClient()
  const { data: info, error } = await client.storage
    .from(MEDIA_BUCKET)
    .info(ticket.path)
  if (
    error ||
    !info ||
    typeof info.size !== "number" ||
    info.size > MAX_BYTES ||
    info.size !== ticket.size ||
    info.contentType !== ticket.contentType
  )
    throw new UserFacingError(
      "Uploaded file doesn't match the requested type and size."
    )
  const { data: row, error: saved } = await client
    .from("brix_uploads")
    .upsert(
      {
        user_id: userId,
        storage_path: ticket.path,
        kind: mediaKindFromMime(ticket.contentType),
        name: ticket.name,
        content_type: ticket.contentType,
        bytes: info.size,
      },
      { onConflict: "storage_path" }
    )
    .select()
    .single()
  if (saved || !row)
    throw new UserFacingError("Couldn't save the upload to your library.")
  return {
    id: row.id,
    kind: mediaKindFromMime(row.content_type),
    url: await signedMediaUrl(row.storage_path, userId),
    name: row.name,
    createdAt: Date.parse(row.created_at),
  }
}

export async function ownUploads(userId: string): Promise<UploadView[]> {
  const { data, error } = await createSupabaseServiceClient()
    .from("brix_uploads")
    .select()
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) throw new UserFacingError("Couldn't load your uploads.")
  return Promise.all(
    (data ?? []).map(async (row) => ({
      id: row.id,
      kind: mediaKindFromMime(row.content_type),
      url: await signedMediaUrl(row.storage_path, userId),
      name: row.name,
      createdAt: Date.parse(row.created_at),
    }))
  )
}

export async function removeUpload(userId: string, id: string) {
  const client = createSupabaseServiceClient()
  const { data } = await client
    .from("brix_uploads")
    .select()
    .eq("id", z.uuid().parse(id))
    .eq("user_id", userId)
    .maybeSingle()
  if (!data) throw new NotFoundError("Upload not found.")
  const { error } = await client.storage
    .from(MEDIA_BUCKET)
    .remove([data.storage_path])
  if (error) throw new UserFacingError("Couldn't delete the uploaded file.")
  const { error: deleted } = await client
    .from("brix_uploads")
    .delete()
    .eq("id", data.id)
    .eq("user_id", userId)
  if (deleted)
    throw new UserFacingError("Couldn't remove the upload from your library.")
}

export async function saveProviderOutput(
  url: string,
  userId: string,
  generationId: string,
  index: number
) {
  const blocked = new BlockList()
  for (const [network, bits] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.168.0.0", 16],
    ["100.64.0.0", 10],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as const)
    blocked.addSubnet(network, bits, "ipv4")
  blocked.addSubnet("::", 128, "ipv6")
  blocked.addSubnet("::1", 128, "ipv6")
  blocked.addSubnet("fc00::", 7, "ipv6")
  blocked.addSubnet("fe80::", 10, "ipv6")
  blocked.addSubnet("::ffff:0:0", 96, "ipv6")
  let parsed = new URL(url)
  let response: Response | undefined
  for (let redirects = 0; redirects < 4; redirects++) {
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      throw new Error("Invalid provider media URL.")
    const host = parsed.hostname.replace(/^\[|\]$/g, "")
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await lookup(host, { all: true })
    if (
      !addresses.length ||
      addresses.some((a) =>
        blocked.check(a.address, a.family === 6 ? "ipv6" : "ipv4")
      )
    )
      throw new Error("Invalid provider media address.")
    response = await fetch(parsed, {
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
      redirect: "manual",
    })
    if (response.status < 300 || response.status >= 400) break
    const next = response.headers.get("location")
    await response.body?.cancel()
    if (!next) throw new Error("Provider media redirect is invalid.")
    parsed = new URL(next, parsed)
    response = undefined
  }
  if (!response) throw new Error("Too many provider media redirects.")
  if (!response.ok || !response.body)
    throw new Error("Provider media download failed.")
  const type =
    response.headers.get("content-type")?.split(";")[0] ??
    "application/octet-stream"
  const bytes = await readCapped(response.body, MAX_BYTES)
  const path = `${userId}/generations/${generationId}/${index}.${extensionFor(type, url)}`
  const { error } = await createSupabaseServiceClient()
    .storage.from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: type, upsert: true })
  if (error) throw new Error("Couldn't save generation media to Supabase.")
  return { path, ...probeMedia(bytes, type) }
}
