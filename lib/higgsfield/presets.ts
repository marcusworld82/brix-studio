import "server-only"
import { isSubscriptionEdition } from "@/lib/edition"
import { UserFacingError } from "@/lib/errors"
import { clientForConnection } from "@/lib/supabase/connections"
import { platformHiggsfieldClient } from "@/lib/supabase/platform-connections"
import type { HiggsfieldClient } from "./client"
import {
  isProviderPresetCatalog,
  type ProviderPreset,
  type ProviderPresetCatalog,
  type ProviderPresetPage,
} from "./preset-types"
const MAX_ITEMS = 1000
const MAX_PAGES = 20
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)
function text(value: unknown, max: number) {
  return typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, max)
    : ""
}
function https(value: unknown) {
  if (typeof value !== "string" || value.length > 2083) return undefined
  try {
    const url = new URL(value)
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname
    )
      return undefined
    return url.href
  } catch {
    return undefined
  }
}
function preset(value: unknown): ProviderPreset | null {
  if (!record(value) || typeof value.id !== "string" || !UUID.test(value.id))
    return null
  if (
    value.hidden === true ||
    value.is_hidden === true ||
    value.visible === false ||
    value.is_visible === false ||
    value.enabled === false ||
    value.is_active === false ||
    ["hidden", "disabled", "deleted", "unavailable"].includes(
      String(value.status ?? value.availability_state)
    )
  )
    return null
  const name = text(value.name, 200)
  if (!name) return null
  const description = text(value.description, 2000)
  const previewImage = https(
    record(value.cover_image)
      ? value.cover_image.url
      : (value.preview_url ?? value.preview_image)
  )
  const previewVideo = https(
    record(value.cover_video)
      ? value.cover_video.url
      : (value.preview_video ?? value.preview_video_url)
  )
  return {
    id: value.id.toLowerCase(),
    name,
    ...(description ? { description } : {}),
    ...(previewImage ? { previewImage } : {}),
    ...(previewVideo ? { previewVideo } : {}),
  }
}
const unavailable = () =>
  new UserFacingError(
    "Preset catalog could not be loaded. Check the provider connection and try again.",
    "PRESETS_UNAVAILABLE"
  )
/** Fixed, authenticated, read-only API catalogs. No shared or account-crossing cache.
 * Verified 2026-11-01: marketing uses size/cursor offsets; Soul returns complete
 * arrays; Genjutsu returns {model,items}. Provider totals are never hardcoded.
 */
export async function fetchProviderPresets(
  client: HiggsfieldClient,
  catalog: ProviderPresetCatalog
): Promise<ProviderPresetPage> {
  try {
    if (!isProviderPresetCatalog(catalog)) throw unavailable()
    const items: ProviderPreset[] = []
    const rawIds = new Set<string>()
    let cursor: number | undefined
    let expectedTotal: number | undefined
    let received = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      const payload = await client.presetCatalogPage(catalog, cursor)
      const rows: unknown = Array.isArray(payload)
        ? payload
        : record(payload)
          ? payload.items
          : null
      if (
        !Array.isArray(rows) ||
        rows.length > MAX_ITEMS ||
        (catalog === "marketing" && rows.length > 50)
      )
        throw unavailable()
      if (record(payload) && payload.total !== undefined) {
        if (
          !Number.isInteger(payload.total) ||
          Number(payload.total) < 0 ||
          Number(payload.total) > MAX_ITEMS ||
          (expectedTotal !== undefined && expectedTotal !== payload.total)
        )
          throw unavailable()
        expectedTotal = Number(payload.total)
      } else if (catalog === "marketing") throw unavailable()
      for (const row of rows) {
        if (record(row) && typeof row.id === "string") {
          const id = row.id.toLowerCase()
          if (rawIds.has(id)) throw unavailable()
          rawIds.add(id)
        }
        const item = preset(row)
        if (item) items.push(item)
      }
      received += rows.length
      if (
        received > MAX_ITEMS ||
        (expectedTotal !== undefined && received > expectedTotal)
      )
        throw unavailable()
      const next = record(payload) ? payload.cursor : undefined
      if (next === null || next === undefined) {
        if (expectedTotal !== undefined && received !== expectedTotal)
          throw unavailable()
        return { catalog, items, total: items.length, fetchedAt: Date.now() }
      }
      if (
        catalog !== "marketing" ||
        !rows.length ||
        !Number.isInteger(next) ||
        next !== received ||
        next <= (cursor ?? 0) ||
        next >= MAX_ITEMS
      )
        throw unavailable()
      cursor = next
    }
    throw unavailable()
  } catch {
    throw unavailable()
  }
}
export async function listUserProviderPresets(
  userId: string,
  catalog: ProviderPresetCatalog
) {
  const { client } = isSubscriptionEdition()
    ? await platformHiggsfieldClient()
    : await clientForConnection(userId)
  return fetchProviderPresets(client, catalog)
}
export async function validateProviderPresetSelection(
  client: HiggsfieldClient,
  path: string,
  input: Record<string, unknown>
): Promise<void> {
  let catalog: ProviderPresetCatalog | undefined
  let selected: unknown
  if (
    [
      "marketing-studio/image",
      "marketing-studio/image/flare",
      "marketing-studio/image/sunburst",
    ].includes(path) &&
    input.enhance_prompt === true
  ) {
    catalog = "marketing"
    selected = input.preset_id
  } else if (path === "higgsfield/genjutsu/restyle/v1.0") {
    catalog = "genjutsu"
    selected = input.preset_id
  } else if (
    [
      "higgsfield-ai/soul/v2/standard",
      "higgsfield-ai/soul/v2/image-to-image",
    ].includes(path) &&
    input.style_id != null &&
    input.style_id !== ""
  ) {
    catalog = "soul-v2"
    selected = input.style_id
  } else if (
    [
      "higgsfield-ai/soul/standard",
      "higgsfield-ai/soul/image-to-image",
    ].includes(path) &&
    input.style_id != null &&
    input.style_id !== ""
  ) {
    catalog = "soul-v1"
    selected = input.style_id
  }
  if (!catalog) return
  if (typeof selected !== "string" || !UUID.test(selected))
    throw new UserFacingError("Choose a valid preset from the current catalog.")
  const page = await fetchProviderPresets(client, catalog)
  if (!page.items.some((item) => item.id === selected.toLowerCase()))
    throw new UserFacingError(
      "This preset is no longer available in the connected provider account. Choose another preset."
    )
}
