import type {
  ProviderPreset,
  ProviderPresetCatalog,
  ProviderPresetPage,
} from "@/lib/higgsfield/preset-types"

export const PROVIDER_PRESET_CATALOGS = {
  marketing: {
    title: "Marketing templates",
    shortTitle: "Marketing",
    description:
      "Opens Marketing Studio Image 2.0 Alpha. You can switch models in the generator.",
    surface: "image",
    field: "preset_id",
    defaultPath: "marketing-studio/image",
    paths: [
      "marketing-studio/image",
      "marketing-studio/image/flare",
      "marketing-studio/image/sunburst",
    ],
    pickerLabel: "Template",
  },
  genjutsu: {
    title: "Genjutsu restyles",
    shortTitle: "Video restyles",
    description: "Restyle a video you upload with a verified provider preset.",
    surface: "video",
    field: "preset_id",
    defaultPath: "higgsfield/genjutsu/restyle/v1.0",
    paths: ["higgsfield/genjutsu/restyle/v1.0"],
    pickerLabel: "Video style",
  },
  "soul-v2": {
    title: "Soul 2 styles",
    shortTitle: "Soul 2",
    description: "Styles available to the Soul 2 image models in your account.",
    surface: "image",
    field: "style_id",
    defaultPath: "higgsfield-ai/soul/v2/standard",
    paths: [
      "higgsfield-ai/soul/v2/standard",
      "higgsfield-ai/soul/v2/image-to-image",
    ],
    pickerLabel: "Soul 2 style",
  },
  "soul-v1": {
    title: "Soul 1 styles",
    shortTitle: "Soul 1",
    description:
      "Styles available to the original Soul image model in your account.",
    surface: "image",
    field: "style_id",
    defaultPath: "higgsfield-ai/soul/standard",
    paths: ["higgsfield-ai/soul/standard"],
    pickerLabel: "Soul 1 style",
  },
} as const
export const PROVIDER_PRESET_GROUPS = Object.keys(
  PROVIDER_PRESET_CATALOGS
) as ProviderPresetCatalog[]
export function presetCatalogForPath(
  path: string
): ProviderPresetCatalog | null {
  return (
    PROVIDER_PRESET_GROUPS.find((catalog) =>
      (PROVIDER_PRESET_CATALOGS[catalog].paths as readonly string[]).includes(
        path
      )
    ) ?? null
  )
}
export function presetGeneratorHref(
  catalog: ProviderPresetCatalog,
  presetId: string
) {
  const config = PROVIDER_PRESET_CATALOGS[catalog]
  return `/${config.surface}?${new URLSearchParams({ liveModel: `hf:${config.defaultPath}`, providerCatalog: catalog, providerPreset: presetId })}`
}
export function verifiedLinkedPreset(
  page: ProviderPresetPage,
  currentModelId: string,
  requestedModelId: string,
  requestedCatalog: ProviderPresetCatalog,
  requestedId: string
): ProviderPreset | null {
  if (
    currentModelId !== requestedModelId ||
    page.catalog !== requestedCatalog ||
    presetCatalogForPath(currentModelId.replace(/^hf:/, "")) !==
      requestedCatalog
  )
    return null
  return page.items.find((preset) => preset.id === requestedId) ?? null
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)
export function parseProviderPresetPage(
  value: unknown,
  catalog: ProviderPresetCatalog
): ProviderPresetPage | null {
  if (
    !record(value) ||
    value.catalog !== catalog ||
    !Array.isArray(value.items) ||
    value.items.length > 5000 ||
    value.total !== value.items.length ||
    typeof value.fetchedAt !== "number" ||
    !Number.isFinite(value.fetchedAt)
  )
    return null
  const ids = new Set<string>()
  for (const item of value.items) {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !item.id ||
      item.id.length > 200 ||
      ids.has(item.id) ||
      typeof item.name !== "string" ||
      !item.name ||
      item.name.length > 500
    )
      return null
    ids.add(item.id)
    for (const key of ["description", "previewImage", "previewVideo"])
      if (item[key] !== undefined && typeof item[key] !== "string") return null
  }
  return value as ProviderPresetPage
}
export function presetPreviewUrl(value?: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
