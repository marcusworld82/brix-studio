import "server-only"
import { z } from "zod"
import { findModel } from "@/generation/catalog"
import { NotFoundError, UserFacingError } from "@/lib/errors"
import type { TemplateView } from "@/lib/templates"
import { createSupabaseServiceClient } from "./server"
import { jsonValue, uuid } from "./library"
import type { Tables } from "./database"

function view(row: Tables<"brix_templates">): TemplateView {
  return {
    id: row.id,
    scope: row.owner_id ? "mine" : "official",
    title: row.title,
    description: row.description,
    surface: z.enum(["image", "video", "audio"]).parse(row.surface),
    modelId: row.model_id,
    modelLabel: findModel(row.model_id)?.label ?? row.model_id,
    prompt: row.prompt,
    settings: z.record(z.string(), z.unknown()).parse(row.settings),
    ...(row.cover_path ? { coverUrl: row.cover_path } : {}),
    ...(row.cover_video_url ? { coverVideoUrl: row.cover_video_url } : {}),
    category: row.category,
    active: row.active,
    createdAt: Date.parse(row.created_at),
  }
}
export async function listSupabaseTemplates(
  ownerId: string | null,
  includeInactive = false
) {
  let query = createSupabaseServiceClient()
    .from("brix_templates")
    .select()
    .order("sort_order")
    .order("created_at", { ascending: false })
    .limit(100)
  query = ownerId ? query.eq("owner_id", ownerId) : query.is("owner_id", null)
  if (!includeInactive) query = query.eq("active", true)
  const { data, error } = await query
  if (error) throw new UserFacingError("Couldn't load the templates.")
  return (data ?? []).map(view)
}
export async function writeSupabaseTemplate(
  ownerId: string | null,
  input: {
    title: string
    description: string
    surface: string
    modelId: string
    prompt: string
    settings: Record<string, unknown>
    coverUrl?: string
    coverVideoUrl?: string
    order?: number
    category?: string
    active?: boolean
  },
  id?: string
) {
  const client = createSupabaseServiceClient()
  if (ownerId) {
    const { count } = await client
      .from("brix_templates")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
    if ((count ?? 0) >= 100 && !id)
      throw new UserFacingError(
        "Delete a saved template before adding another."
      )
  }
  const fields = {
    owner_id: ownerId,
    title: input.title,
    description: input.description,
    surface: input.surface,
    model_id: input.modelId,
    prompt: input.prompt,
    settings: jsonValue(input.settings),
    cover_path: input.coverUrl || null,
    cover_video_url: input.coverVideoUrl || null,
    sort_order: input.order ?? 0,
    category: input.category ?? "Mine",
    active: input.active ?? true,
    updated_at: new Date().toISOString(),
  }
  if (id) {
    let query = client.from("brix_templates").update(fields).eq("id", uuid(id))
    query = ownerId ? query.eq("owner_id", ownerId) : query.is("owner_id", null)
    const { data, error } = await query.select().maybeSingle()
    if (error || !data) throw new NotFoundError("Template not found.")
    return view(data)
  }
  const { data, error } = await client
    .from("brix_templates")
    .insert(fields)
    .select()
    .single()
  if (error || !data) throw new UserFacingError("Couldn't save this template.")
  return view(data)
}
export async function removeSupabaseTemplate(
  ownerId: string | null,
  id: string
) {
  let query = createSupabaseServiceClient()
    .from("brix_templates")
    .delete()
    .eq("id", uuid(id))
  query = ownerId ? query.eq("owner_id", ownerId) : query.is("owner_id", null)
  const { data, error } = await query.select("id")
  if (error || !data?.length) throw new NotFoundError("Template not found.")
}
