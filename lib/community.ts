import "server-only"

import { ObjectId, type Filter } from "mongodb"
import { z } from "zod"

import type { MediaKind, Surface } from "@/generation/catalog/types"
import { UserFacingError } from "@/lib/errors"
import type { SessionUser } from "@/lib/auth/session"
import { objectIdOrNotFound } from "@/lib/ids"
import { NotFoundError } from "@/lib/errors"
import {
  collections,
  type GenerationDoc,
  type UserDoc,
} from "@/lib/db/collections"
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit"

/**
 * Community shows only generations their owner explicitly published, never
 * unpublished or moderated ones, and never the author's email.
 */
export interface PublicGeneration {
  id: string
  surface: Surface
  modelId: string
  modelLabel: string
  prompt: string
  settings: Record<string, unknown>
  outputs: {
    kind: MediaKind
    url: string
    width?: number
    height?: number
    durationSec?: number
  }[]
  aspect: number
  author: { name: string; image?: string }
  publishedAt: number
}

const PUBLIC_FILTER: Filter<GenerationDoc> = {
  isPublic: true,
  status: "completed",
  unpublishedByAdmin: { $ne: true },
}

function displayName(user?: Pick<UserDoc, "name" | "email"> | null): string {
  const name = user?.name?.trim()
  if (name) return name.split(/\s+/)[0]!.slice(0, 24)
  return "BRIX creator"
}

async function withAuthors(docs: GenerationDoc[]): Promise<PublicGeneration[]> {
  const { users } = await collections()
  const ids = [...new Set(docs.map((doc) => doc.userId.toHexString()))].map(
    (id) => new ObjectId(id)
  )
  const authors = await users
    .find(
      { _id: { $in: ids } },
      { projection: { name: 1, image: 1, email: 1 } }
    )
    .toArray()
  const byId = new Map(authors.map((user) => [user._id.toHexString(), user]))
  return docs.map((doc) => {
    const author = byId.get(doc.userId.toHexString())
    return {
      id: doc._id.toHexString(),
      surface: doc.surface,
      modelId: doc.modelId,
      modelLabel: doc.modelLabel,
      prompt: doc.prompt,
      settings: doc.settings,
      outputs: doc.outputs.map(({ kind, url, width, height, durationSec }) => ({
        kind,
        url,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(durationSec ? { durationSec } : {}),
      })),
      aspect: doc.aspect,
      author: {
        name: displayName(author),
        ...(author?.image ? { image: author.image } : {}),
      },
      publishedAt: (doc.publishedAt ?? doc.createdAt).getTime(),
    }
  })
}

export async function listPublic(input: {
  surface?: Surface
  modelId?: string
  cursor?: string
  limit?: number
}): Promise<{ items: PublicGeneration[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 40, 1), 80)
  const { generations } = await collections()
  const filter: Filter<GenerationDoc> = { ...PUBLIC_FILTER }
  if (input.surface) filter.surface = input.surface
  if (input.modelId) filter.modelId = input.modelId
  if (input.cursor) {
    const at = new Date(Number(input.cursor))
    if (!Number.isNaN(at.getTime())) filter.publishedAt = { $lt: at }
  }
  const docs = await generations
    .find(filter)
    .sort({ publishedAt: -1 })
    .limit(limit + 1)
    .toArray()
  const page = docs.slice(0, limit)
  const last = page.at(-1)
  return {
    items: await withAuthors(page),
    nextCursor:
      docs.length > limit && last?.publishedAt
        ? String(last.publishedAt.getTime())
        : null,
  }
}

export async function getPublic(id: string): Promise<PublicGeneration | null> {
  if (!ObjectId.isValid(id) || id.length !== 24) return null
  const { generations } = await collections()
  const doc = await generations.findOne({
    ...PUBLIC_FILTER,
    _id: new ObjectId(id),
  })
  if (!doc) return null
  return (await withAuthors([doc]))[0] ?? null
}

export const reportSchema = z.object({
  generationId: z.string(),
  reason: z.enum(["sexual", "violence", "hate", "copyright", "spam", "other"]),
  details: z.string().trim().max(500).optional(),
})

export async function reportGeneration(
  user: SessionUser,
  raw: unknown
): Promise<void> {
  const input = reportSchema.parse(raw)
  await enforceRateLimit(
    `report:${user.id}`,
    LIMITS.reportPerUser.limit,
    LIMITS.reportPerUser.window,
    "You've sent a lot of reports. Thanks — we'll review them."
  )
  const { generations, reports } = await collections()
  const generationId = objectIdOrNotFound(input.generationId)
  const doc = await generations.findOne({ ...PUBLIC_FILTER, _id: generationId })
  if (!doc) throw new NotFoundError("That generation is no longer public.")
  const existing = await reports.findOne({
    generationId,
    reporterId: user.objectId,
    status: "open",
  })
  if (existing)
    throw new UserFacingError("You already reported this. We're on it.")
  await reports.insertOne({
    _id: new ObjectId(),
    generationId,
    reporterId: user.objectId,
    reason: input.reason,
    ...(input.details ? { details: input.details } : {}),
    status: "open",
    createdAt: new Date(),
  })
}
