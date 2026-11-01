/** Client-safe metadata only. Provider credentials and upstream payloads stay server-side. */
export type ProviderPresetCatalog =
  "marketing" | "genjutsu" | "soul-v2" | "soul-v1"
export type ProviderPreset = {
  id: string
  name: string
  description?: string
  previewImage?: string
  previewVideo?: string
}
export type ProviderPresetPage = {
  catalog: ProviderPresetCatalog
  items: ProviderPreset[]
  total: number
  fetchedAt: number
}
export function isProviderPresetCatalog(
  value: unknown
): value is ProviderPresetCatalog {
  return (
    value === "marketing" ||
    value === "genjutsu" ||
    value === "soul-v2" ||
    value === "soul-v1"
  )
}
