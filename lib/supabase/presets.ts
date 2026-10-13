import "server-only"
import { findModel } from "@/generation/catalog"
import { UserFacingError } from "@/lib/errors"
import { coverFor, presetSchema, type PresetView } from "@/lib/presets"
import { PRESET_SEED, PRESET_LOOPS } from "@/lib/presets/seed-data"
import { createSupabaseServiceClient } from "./server"
import { jsonValue, uuid } from "./library"
import type { Tables } from "./database"
function view(row: Tables<"brix_presets">): PresetView {
  const input = presetSchema.parse(row.data)
  return {
    ...input,
    id: row.id,
    active: row.active,
    modelLabel: findModel(input.modelId)?.label ?? input.modelId,
  }
}
export async function listSupabasePresets(includeInactive = false) {
  let query = createSupabaseServiceClient()
    .from("brix_presets")
    .select()
    .order("sort_order")
    .limit(200)
  if (!includeInactive) query = query.eq("active", true)
  const { data, error } = await query
  if (error) throw new UserFacingError("Couldn't load effects.")
  return (data ?? []).map(view)
}
export async function seedSupabasePresets() {
  const { error } = await createSupabaseServiceClient()
    .from("brix_presets")
    .upsert(
      PRESET_SEED.map((seed, index) => ({
        slug: seed.slug,
        data: jsonValue({
          ...seed,
          coverUrl: coverFor(seed.slug),
          coverVideoUrl: PRESET_LOOPS[seed.slug],
          active: true,
          order: index,
        }),
        sort_order: index,
      })),
      { onConflict: "slug", ignoreDuplicates: true }
    )
  if (error) throw new Error("Couldn't seed effects.")
}
export async function writeSupabasePreset(
  input: ReturnType<typeof presetSchema.parse>,
  id?: string
) {
  const client = createSupabaseServiceClient()
  const fields = {
    slug: input.slug,
    data: jsonValue(input),
    active: input.active,
    sort_order: input.order,
  }
  const query = id
    ? client.from("brix_presets").update(fields).eq("id", uuid(id))
    : client.from("brix_presets").insert(fields)
  const { data, error } = await query.select().single()
  if (error || !data)
    throw new UserFacingError(
      "Couldn't save this effect. Check that its slug is unique."
    )
  return view(data)
}
export async function removeSupabasePreset(id: string) {
  const { error } = await createSupabaseServiceClient()
    .from("brix_presets")
    .delete()
    .eq("id", uuid(id))
  if (error) throw new UserFacingError("Couldn't delete this effect.")
}
