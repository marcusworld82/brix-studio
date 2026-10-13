import "server-only"
import { z } from "zod"
import { NotFoundError, UserFacingError } from "@/lib/errors"
import type { GenerationView, ProjectView } from "@/lib/generations/view"
import { createSupabaseServiceClient } from "./server"
import type { Json, Tables } from "./database"
import { MEDIA_BUCKET, signedMediaUrl } from "./media"

export const states = [
  "pending_submit",
  "queued",
  "in_progress",
  "completed",
  "failed",
  "nsfw",
  "canceled",
] as const
const outputSchema = z.object({
  kind: z.enum(["image", "video", "audio"]),
  path: z.string().optional(),
  url: z.url().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  durationSec: z.number().optional(),
})
const inputSchema = z.object({
  role: z.enum(["start", "end", "reference", "video", "audio", "source"]),
  kind: z.enum(["image", "video", "audio"]),
  path: z.string(),
  name: z.string().optional(),
})
export function jsonValue(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}
export function uuid(value: string): string {
  if (!z.uuid().safeParse(value).success) throw new NotFoundError()
  return value
}

export async function generationView(
  row: Tables<"brix_generations">
): Promise<GenerationView> {
  const outputs = z.array(outputSchema).parse(row.outputs)
  const media = z.array(inputSchema).parse(row.input_media)
  return {
    billingSource: "higgsfield-api",
    apiCostEstimate: row.provider_cost_estimate,
    id: row.id,
    surface: z.enum(["image", "video", "audio"]).parse(row.surface),
    modelId: row.model_id,
    modelLabel: row.model_label,
    prompt: row.prompt,
    settings: z.record(z.string(), z.unknown()).parse(row.settings),
    media: await Promise.all(
      media.map(async (m) => ({
        role: m.role,
        kind: m.kind,
        url: await signedMediaUrl(m.path, row.user_id).catch(
          () => `${process.env.APP_URL ?? ""}/api/media/${m.path}`
        ),
        ...(m.name ? { name: m.name } : {}),
      }))
    ),
    status: z.enum(states).parse(row.status),
    cost: 0,
    refunded: 0,
    outputs: await Promise.all(
      outputs.map(async (o) => ({
        kind: o.kind,
        url: o.path ? await signedMediaUrl(o.path, row.user_id) : o.url!,
        ...(o.width ? { width: o.width } : {}),
        ...(o.height ? { height: o.height } : {}),
        ...(o.durationSec ? { durationSec: o.durationSec } : {}),
      }))
    ),
    aspect: row.aspect,
    isPublic: false,
    ...(row.error
      ? { error: row.error }
      : row.status === "canceled"
        ? { error: "Canceled on your Higgsfield API account." }
        : {}),
    ...(row.error_kind ? { errorKind: row.error_kind } : {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.preset_id ? { presetId: row.preset_id } : {}),
    createdAt: Date.parse(row.created_at),
    ...(row.finished_at ? { finishedAt: Date.parse(row.finished_at) } : {}),
  }
}

export async function ownGeneration(userId: string, id: string) {
  const { data, error } = await createSupabaseServiceClient()
    .from("brix_generations")
    .select()
    .eq("id", uuid(id))
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new UserFacingError("Couldn't load this generation.")
  if (!data) throw new NotFoundError("Generation not found.")
  return data
}

export async function listOwnGenerations(
  userId: string,
  options: {
    surface?: string
    projectId?: string
    status?: string
    cursor?: string
    limit?: number
  } = {}
) {
  let query = createSupabaseServiceClient()
    .from("brix_generations")
    .select()
    .eq("user_id", userId)
  if (options.surface && ["image", "video", "audio"].includes(options.surface))
    query = query.eq("surface", options.surface)
  if (options.projectId) query = query.eq("project_id", uuid(options.projectId))
  if (options.status === "completed") query = query.eq("status", "completed")
  if (options.status === "failed")
    query = query.in("status", ["failed", "nsfw", "canceled"])
  if (options.cursor) {
    const cursor = z
      .object({ time: z.iso.datetime(), id: z.uuid() })
      .parse(JSON.parse(Buffer.from(options.cursor, "base64url").toString()))
    query = query.or(
      `created_at.lt.${cursor.time},and(created_at.eq.${cursor.time},id.lt.${cursor.id})`
    )
  }
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 60))
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1)
  if (error) throw new UserFacingError("Couldn't load your generation library.")
  const rows = (data ?? []).slice(0, limit)
  const last = rows.at(-1)
  return {
    items: await Promise.all(rows.map(generationView)),
    nextCursor:
      (data?.length ?? 0) > limit && last
        ? Buffer.from(
            JSON.stringify({ time: last.created_at, id: last.id })
          ).toString("base64url")
        : null,
  }
}

export async function ownStatuses(userId: string, ids: string[]) {
  const valid = ids.filter((id) => z.uuid().safeParse(id).success).slice(0, 50)
  if (!valid.length) return []
  const { data, error } = await createSupabaseServiceClient()
    .from("brix_generations")
    .select()
    .eq("user_id", userId)
    .in("id", valid)
  if (error) throw new UserFacingError("Couldn't refresh your generations.")
  return Promise.all((data ?? []).map(generationView))
}

async function projectView(row: Tables<"brix_projects">): Promise<ProjectView> {
  const { count } = await createSupabaseServiceClient()
    .from("brix_generations")
    .select("id", { count: "exact", head: true })
    .eq("project_id", row.id)
    .eq("user_id", row.user_id)
  return {
    id: row.id,
    name: row.name,
    generationCount: count ?? 0,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  }
}
export async function ownProjects(userId: string): Promise<ProjectView[]> {
  const { data, error } = await createSupabaseServiceClient()
    .from("brix_projects")
    .select()
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100)
  if (error) throw new UserFacingError("Couldn't load your projects.")
  return Promise.all((data ?? []).map(projectView))
}
export async function ownProject(
  userId: string,
  id: string
): Promise<ProjectView> {
  const { data, error } = await createSupabaseServiceClient()
    .from("brix_projects")
    .select()
    .eq("id", uuid(id))
    .eq("user_id", userId)
    .maybeSingle()
  if (error || !data) throw new NotFoundError("Project not found.")
  return projectView(data)
}
export async function newProject(
  userId: string,
  name: string
): Promise<ProjectView> {
  const { data, error } = await createSupabaseServiceClient()
    .from("brix_projects")
    .insert({
      user_id: userId,
      name: z.string().trim().min(1).max(100).parse(name),
    })
    .select()
    .single()
  if (error || !data) throw new UserFacingError("Couldn't create the project.")
  return projectView(data)
}
export async function changeProject(userId: string, id: string, name?: string) {
  await ownProject(userId, id)
  const client = createSupabaseServiceClient()
  const result =
    name === undefined
      ? await client
          .from("brix_projects")
          .delete()
          .eq("id", id)
          .eq("user_id", userId)
      : await client
          .from("brix_projects")
          .update({
            name: z.string().trim().min(1).max(100).parse(name),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("user_id", userId)
  if (result.error) throw new UserFacingError("Couldn't update the project.")
}
export async function moveGenerations(
  userId: string,
  ids: string[],
  projectId: string | null
) {
  if (projectId) await ownProject(userId, projectId)
  const { data, error } = await createSupabaseServiceClient()
    .from("brix_generations")
    .update({ project_id: projectId, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", ids.slice(0, 200).map(uuid))
    .select("id")
  if (error) throw new UserFacingError("Couldn't move these generations.")
  return { moved: data?.length ?? 0 }
}
export async function removeGenerations(userId: string, ids: string[]) {
  const client = createSupabaseServiceClient()
  const { data, error } = await client
    .from("brix_generations")
    .select()
    .eq("user_id", userId)
    .in("id", ids.slice(0, 200).map(uuid))
  if (error) throw new UserFacingError("Couldn't load these generations.")
  if (
    data?.some((row) =>
      ["pending_submit", "queued", "in_progress"].includes(row.status)
    )
  )
    throw new UserFacingError("Cancel active generations before deleting them.")
  const paths = (data ?? [])
    .flatMap((row) =>
      z
        .array(outputSchema)
        .parse(row.outputs)
        .flatMap((o) => (o.path ? [o.path] : []))
    )
    .filter((path) => path.startsWith(`${userId}/`))
  if (paths.length) {
    const removed = await client.storage.from(MEDIA_BUCKET).remove(paths)
    if (removed.error)
      throw new UserFacingError("Couldn't remove the generation files.")
  }
  const result = await client
    .from("brix_generations")
    .delete()
    .eq("user_id", userId)
    .in(
      "id",
      (data ?? []).map((row) => row.id)
    )
    .select("id")
  if (result.error)
    throw new UserFacingError("Couldn't remove the generations.")
  return { deleted: result.data?.length ?? 0 }
}
