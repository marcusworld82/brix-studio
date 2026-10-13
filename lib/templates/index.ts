import "server-only"

import { ObjectId } from "mongodb"
import { z } from "zod"

import { findModel } from "@/generation/catalog"
import type { Surface } from "@/generation/catalog/types"
import { collections, type TemplateDoc } from "@/lib/db/collections"
import { isSupabaseBackend } from "@/lib/backend"
import {
  listSupabaseTemplates,
  writeSupabaseTemplate,
  removeSupabaseTemplate,
} from "@/lib/supabase/templates"
import { NotFoundError, UserFacingError } from "@/lib/errors"
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit"
import type { SessionUser } from "@/lib/auth/session"

export const MAX_USER_TEMPLATES = 100

export interface TemplateView {
  id: string
  scope: "official" | "mine"
  title: string
  description: string
  surface: Surface
  modelId: string
  modelLabel: string
  prompt: string
  settings: Record<string, unknown>
  coverUrl?: string
  coverVideoUrl?: string
  category: string
  active: boolean
  createdAt: number
}

function toView(doc: TemplateDoc): TemplateView {
  return {
    id: doc._id.toHexString(),
    scope: doc.ownerId ? "mine" : "official",
    title: doc.title,
    description: doc.description,
    surface: doc.surface,
    modelId: doc.modelId,
    modelLabel: findModel(doc.modelId)?.label ?? doc.modelId,
    prompt: doc.prompt,
    settings: doc.settings,
    ...(doc.coverUrl ? { coverUrl: doc.coverUrl } : {}),
    ...(doc.coverVideoUrl ? { coverVideoUrl: doc.coverVideoUrl } : {}),
    category: doc.category,
    active: doc.active,
    createdAt: doc.createdAt.getTime(),
  }
}

/** Premade BRIX templates (uploaded by the admin). */
export async function listOfficialTemplates(
  options: { includeInactive?: boolean } = {}
): Promise<TemplateView[]> {
  if (isSupabaseBackend())
    return listSupabaseTemplates(null, options.includeInactive)
  const { templates } = await collections()
  const docs = await templates
    .find({
      ownerId: null,
      ...(options.includeInactive ? {} : { active: true }),
    })
    .sort({ order: 1, createdAt: -1 })
    .toArray()
  return docs.filter((doc) => findModel(doc.modelId)).map(toView)
}

/** Templates this user saved, newest first. Never returns anyone else's. */
export async function listMyTemplates(
  user: Pick<SessionUser, "objectId" | "id">
): Promise<TemplateView[]> {
  if (isSupabaseBackend()) return listSupabaseTemplates(user.id)
  const { templates } = await collections()
  const docs = await templates
    .find({ ownerId: user.objectId })
    .sort({ createdAt: -1 })
    .limit(MAX_USER_TEMPLATES)
    .toArray()
  return docs.filter((doc) => findModel(doc.modelId)).map(toView)
}

const recipeShape = {
  title: z.string().trim().min(2, "Give it a name.").max(60),
  description: z.string().trim().max(240).default(""),
  surface: z.enum(["image", "video", "audio"]),
  modelId: z.string().refine((id) => Boolean(findModel(id)), "Unknown model."),
  prompt: z.string().trim().min(1, "A template needs a prompt.").max(4000),
  settings: z.record(z.string(), z.unknown()).default({}),
  coverUrl: z.string().trim().max(500).optional(),
  coverVideoUrl: z.string().trim().max(500).optional(),
}

export const userTemplateSchema = z.object(recipeShape)

export const officialTemplateSchema = z.object({
  ...recipeShape,
  category: z.string().trim().min(2).max(40),
  order: z.coerce.number().int().min(0).max(10_000),
  active: z.boolean().default(true),
})

function assertSurface(input: { surface: Surface; modelId: string }) {
  if (findModel(input.modelId)?.surface !== input.surface)
    throw new UserFacingError(
      "The model's surface must match the template's surface."
    )
}

/** Cover URLs must be our own media (relative path) or https. */
function assertCover(url?: string) {
  if (url && !/^(https?:\/\/|\/)/.test(url))
    throw new UserFacingError("Cover must be an http(s) URL or a /path.")
}

export async function createUserTemplate(
  user: SessionUser,
  raw: unknown
): Promise<TemplateView> {
  const input = userTemplateSchema.parse(raw)
  assertSurface(input)
  assertCover(input.coverUrl)
  assertCover(input.coverVideoUrl)
  await enforceRateLimit(
    `template:${user.id}`,
    LIMITS.templatePerUser.limit,
    LIMITS.templatePerUser.window,
    "You're saving templates quickly. Try again in a bit."
  )
  if (isSupabaseBackend()) return writeSupabaseTemplate(user.id, input)
  const { templates } = await collections()
  if (
    (await templates.countDocuments({ ownerId: user.objectId })) >=
    MAX_USER_TEMPLATES
  )
    throw new UserFacingError(
      `You can keep up to ${MAX_USER_TEMPLATES} templates. Delete one first.`
    )
  const now = new Date()
  const doc: TemplateDoc = {
    _id: new ObjectId(),
    ownerId: user.objectId,
    ...input,
    category: "Mine",
    order: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
  }
  await templates.insertOne(doc)
  return toView(doc)
}

/** Only the owner can delete; anyone else's id is a plain 404. */
export async function deleteUserTemplate(
  user: SessionUser,
  id: string
): Promise<void> {
  if (isSupabaseBackend()) return removeSupabaseTemplate(user.id, id)
  if (!ObjectId.isValid(id)) throw new NotFoundError("Template not found.")
  const { templates } = await collections()
  const result = await templates.deleteOne({
    _id: new ObjectId(id),
    ownerId: user.objectId,
  })
  if (!result.deletedCount) throw new NotFoundError("Template not found.")
}

export async function upsertOfficialTemplate(
  raw: unknown,
  id?: string
): Promise<TemplateView> {
  const input = officialTemplateSchema.parse(raw)
  assertSurface(input)
  assertCover(input.coverUrl)
  assertCover(input.coverVideoUrl)
  if (isSupabaseBackend()) return writeSupabaseTemplate(null, input, id)
  const { templates } = await collections()
  const now = new Date()
  const fields = {
    ...input,
    coverUrl: input.coverUrl || undefined,
    coverVideoUrl: input.coverVideoUrl || undefined,
  }
  const $unset: Record<string, ""> = {}
  if (!fields.coverUrl) $unset.coverUrl = ""
  if (!fields.coverVideoUrl) $unset.coverVideoUrl = ""
  const $set = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  )
  if (id) {
    if (!ObjectId.isValid(id)) throw new NotFoundError("Template not found.")
    const updated = await templates.findOneAndUpdate(
      { _id: new ObjectId(id), ownerId: null },
      {
        $set: { ...$set, updatedAt: now },
        ...(Object.keys($unset).length ? { $unset } : {}),
      },
      { returnDocument: "after" }
    )
    if (!updated) throw new NotFoundError("Template not found.")
    return toView(updated)
  }
  const doc: TemplateDoc = {
    _id: new ObjectId(),
    ownerId: null,
    ...input,
    createdAt: now,
    updatedAt: now,
  }
  if (!doc.coverUrl) delete doc.coverUrl
  if (!doc.coverVideoUrl) delete doc.coverVideoUrl
  await templates.insertOne(doc)
  return toView(doc)
}

export async function deleteOfficialTemplate(id: string): Promise<void> {
  if (isSupabaseBackend()) return removeSupabaseTemplate(null, id)
  if (!ObjectId.isValid(id)) throw new NotFoundError("Template not found.")
  const { templates } = await collections()
  await templates.deleteOne({ _id: new ObjectId(id), ownerId: null })
}
