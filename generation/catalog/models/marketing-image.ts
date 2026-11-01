// Marketing Studio Image — 2.5 Flare, 2.5 Sunburst and 2.0 (generate and edit).
// Sources:
//   https://docs.higgsfield.ai/docs/models/marketing-studio-image
//   https://docs.higgsfield.ai/docs/models/marketing-studio-image/flare
//   https://docs.higgsfield.ai/docs/models/marketing-studio-image/sunburst
//   https://docs.higgsfield.ai/docs/models/marketing-studio-image/generate-and-edit
// Not exposed: preset_id / enhance_prompt (preset enhancement is v2; the API
// default enhance_prompt=false is what we want, so the field is omitted) and
// moderation (omitted = auto).
import { compact, requirePrompt, urls } from "../mappers"
import type {
  GenerationPlane,
  ModelEntry,
  PlatformRequest,
  SettingField,
} from "../types"

const DOCS = "https://docs.higgsfield.ai/docs/models/marketing-studio-image"

const meta = {
  surface: "image",
  family: "Marketing Studio",
  provider: "Higgsfield",
  icon: "higgsfield",
  roles: { reference: 16 },
  requirePrompt: true,
  maxPromptLength: 5000,
} as const

const QUALITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
} as const

function quality(
  values: readonly (keyof typeof QUALITY_LABELS)[]
): SettingField {
  return {
    type: "enum",
    values,
    default: "high",
    label: "Quality",
    labels: Object.fromEntries(
      values.map((value) => [value, QUALITY_LABELS[value]])
    ),
  }
}

const shared = {
  aspectRatio: {
    type: "enum",
    values: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"],
    default: "auto",
    label: "Aspect ratio",
    labels: { auto: "Auto" },
    hint: "Auto renders a square image.",
  },
  resolution: {
    type: "enum",
    values: ["1k", "2k", "4k"],
    default: "2k",
    label: "Resolution",
    labels: { "1k": "1K", "2k": "2K", "4k": "4K" },
  },
} as const satisfies ModelEntry["settings"]

function marketingImage(path: string, label: string) {
  return (plane: GenerationPlane): PlatformRequest => {
    const refs = urls(plane, "reference")
    return {
      path,
      body: compact({
        prompt: requirePrompt(plane, label),
        quality: plane.settings.quality,
        resolution: plane.settings.resolution,
        aspect_ratio: plane.settings.aspectRatio,
        image_urls: refs.length ? refs : undefined,
      }),
    }
  }
}

export const marketingImageFlare: ModelEntry = {
  ...meta,
  id: "marketing-image-flare",
  family: "GPT Image 2.5",
  label: "GPT Image 2.5 Flare",
  description:
    "GPT Image 2.5 Flare. Generate or edit with up to 16 reference images.",
  bestFor: "Product ads, banners and layouts with text",
  badges: ["TOP", "NEW", "4K"],
  category: "ADS",
  settings: {
    ...shared,
    quality: quality(["low", "medium", "high", "xhigh", "max"]),
  },
  order: 10,
  docs: [DOCS, `${DOCS}/flare`],
  toPlatform: marketingImage(
    "marketing-studio/image/flare",
    "GPT Image 2.5 Flare"
  ),
}

export const marketingImageSunburst: ModelEntry = {
  ...meta,
  id: "marketing-image-sunburst",
  family: "GPT Image 2.5",
  label: "GPT Image 2.5 Sunburst",
  description:
    "GPT Image 2.5 Sunburst. Generate or edit with up to 16 reference images.",
  bestFor: "Alternate looks for campaign images",
  badges: ["NEW", "4K"],
  category: "ADS",
  settings: {
    ...shared,
    quality: quality(["low", "medium", "high", "xhigh", "max"]),
  },
  order: 11,
  docs: [DOCS, `${DOCS}/sunburst`],
  toPlatform: marketingImage(
    "marketing-studio/image/sunburst",
    "GPT Image 2.5 Sunburst"
  ),
}

export const marketingImage2: ModelEntry = {
  ...meta,
  id: "marketing-image-2",
  label: "Marketing Image 2.0",
  description:
    "The earlier marketing image model for campaign pictures and reference-based edits, with three quality tiers.",
  bestFor: "Everyday campaign images at lower cost",
  badges: ["4K"],
  category: "ADS",
  settings: { ...shared, quality: quality(["low", "medium", "high"]) },
  order: 12,
  docs: [DOCS, `${DOCS}/generate-and-edit`],
  toPlatform: marketingImage("marketing-studio/image", "Marketing Image 2.0"),
}

const models = [marketingImageFlare, marketingImageSunburst, marketingImage2]
export default models
