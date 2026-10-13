import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { Readable } from "node:stream"

import { localPathFor, storageDriver } from "@/lib/storage"
import { isSupabaseBackend } from "@/lib/backend"
import { currentUser } from "@/lib/auth/session"
import { signedMediaUrl } from "@/lib/supabase/media"

export const runtime = "nodejs"

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
}

/**
 * Development media server for the local storage driver (production serves
 * media from R2). Supports Range requests so videos can seek.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  if (isSupabaseBackend()) {
    const user = await currentUser()
    if (!user) return new Response("Not found", { status: 404 })
    try {
      return Response.redirect(
        await signedMediaUrl((await params).key.join("/"), user.id),
        307
      )
    } catch {
      return new Response("Not found", { status: 404 })
    }
  }
  if (storageDriver() === "r2")
    return new Response("Not found", { status: 404 })
  const { key } = await params
  let path: string
  try {
    path = localPathFor(key.join("/"))
  } catch {
    return new Response("Not found", { status: 404 })
  }
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) return new Response("Not found", { status: 404 })
  const type =
    TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ??
    "application/octet-stream"
  const range = request.headers.get("range")?.match(/bytes=(\d*)-(\d*)/)
  if (range) {
    const start = range[1] ? Number(range[1]) : 0
    const end = range[2]
      ? Math.min(Number(range[2]), info.size - 1)
      : info.size - 1
    if (start > end || start >= info.size)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      })
    return new Response(
      Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream,
      {
        status: 206,
        headers: {
          "Content-Type": type,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${info.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        },
      }
    )
  }
  return new Response(
    Readable.toWeb(createReadStream(path)) as ReadableStream,
    {
      headers: {
        "Content-Type": type,
        "Content-Length": String(info.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    }
  )
}
