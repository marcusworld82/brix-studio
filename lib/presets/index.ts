import "server-only"

import { ObjectId } from "mongodb"
import { z } from "zod"

import { findModel } from "@/generation/catalog"
import { UserFacingError } from "@/lib/errors"
import { collections, type PresetDoc } from "@/lib/db/collections"
import { isSupabaseBackend } from "@/lib/backend"

import { PRESET_LOOPS, PRESET_SEED } from "./seed-data"

export interface PresetView {
  id: string
  slug: string
  title: string
  description: string
  surface: PresetDoc["surface"]
  modelId: string
  modelLabel: string
  promptTemplate: string
  settings: Record<string, unknown>
  coverUrl: string
  coverVideoUrl?: string
  category: string
  active: boolean
}

export function coverFor(slug: string): string {
  return `/media/presets/${slug}.jpg`
}

function toView(doc: PresetDoc): PresetView {
  return {
    id: doc._id.toHexString(),
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    surface: doc.surface,
    modelId: doc.modelId,
    modelLabel: findModel(doc.modelId)?.label ?? doc.modelId,
    promptTemplate: doc.promptTemplate,
    settings: doc.settings,
    coverUrl: doc.coverUrl,
    ...(doc.coverVideoUrl ? { coverVideoUrl: doc.coverVideoUrl } : {}),
    category: doc.category,
    active: doc.active,
  }
}

/** Seed presets that don't exist yet (never overwrites admin edits). */
export async function seedPresets(): Promise<number> {
  const { presets } = await collections()
  let inserted = 0
  for (const seed of PRESET_SEED) {
    const now = new Date()
    const result = await presets.updateOne(
      { slug: seed.slug },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          ...seed,
          coverUrl: coverFor(seed.slug),
          ...(PRESET_LOOPS[seed.slug]
            ? { coverVideoUrl: PRESET_LOOPS[seed.slug] }
            : {}),
          active: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    )
    if (result.upsertedCount) inserted++
  }
  return inserted
}

export async function listPresets(
  options: { includeInactive?: boolean } = {}
): Promise<PresetView[]> {
  if (isSupabaseBackend()) {
    const { listSupabasePresets } = await import("@/lib/supabase/presets")
    return listSupabasePresets(options.includeInactive)
  }
  const { presets } = await collections()
  const docs = await presets
    .find(options.includeInactive ? {} : { active: true })
    .sort({ order: 1 })
    .toArray()
  return docs.filter((doc) => findModel(doc.modelId)).map(toView)
}

export async function getPreset(slug: string): Promise<PresetView | null> {
  if (isSupabaseBackend())
    return (await listPresets()).find((preset) => preset.slug === slug) ?? null
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null
  const { presets } = await collections()
  const doc = await presets.findOne({ slug, active: true })
  return doc && findModel(doc.modelId) ? toView(doc) : null
}

/** Apply a preset template to the user's prompt. */
export function applyTemplate(template: string, subject: string): string {
  const clean = subject.trim()
  return template.includes("{subject}")
    ? template.replace("{subject}", clean || "a striking subject").trim()
    : `${clean ? `${clean}, ` : ""}${template}`
}

export const presetSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9-]{2,60}$/, "Use lowercase letters, numbers and dashes."),
  title: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240),
  surface: z.enum(["image", "video", "audio"]),
  modelId: z.string().refine((id) => Boolean(findModel(id)), "Unknown model."),
  promptTemplate: z.string().trim().min(3).max(2000),
  settings: z.record(z.string(), z.unknown()).default({}),
  coverUrl: z.string().trim().min(1).max(500),
  coverVideoUrl: z.string().trim().max(500).optional(),
  category: z.string().trim().min(2).max(40),
  order: z.coerce.number().int().min(0).max(10_000),
  active: z.boolean().default(true),
})

export async function upsertPreset(
  raw: unknown,
  id?: string
): Promise<PresetView> {
  const input = presetSchema.parse(raw)
  const model = findModel(input.modelId)!
  if (model.surface !== input.surface)
    throw new UserFacingError(
      "The model's surface must match the preset's surface."
    )
  if (isSupabaseBackend()) {
    const { writeSupabasePreset } = await import("@/lib/supabase/presets")
    return writeSupabasePreset(input, id)
  }
  const { presets } = await collections()
  const now = new Date()
  if (id) {
    if (!ObjectId.isValid(id)) throw new UserFacingError("Preset not found.")
    const updated = await presets.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...input, updatedAt: now } },
      { returnDocument: "after" }
    )
    if (!updated) throw new UserFacingError("Preset not found.")
    return toView(updated)
  }
  const doc: PresetDoc = {
    _id: new ObjectId(),
    ...input,
    createdAt: now,
    updatedAt: now,
  }
  await presets.insertOne(doc)
  return toView(doc)
}

export async function deletePreset(id: string): Promise<void> {
  if (isSupabaseBackend()) {
    const { removeSupabasePreset } = await import("@/lib/supabase/presets")
    return removeSupabasePreset(id)
  }
  if (!ObjectId.isValid(id)) throw new UserFacingError("Preset not found.")
  const { presets } = await collections()
  await presets.deleteOne({ _id: new ObjectId(id) })
}
