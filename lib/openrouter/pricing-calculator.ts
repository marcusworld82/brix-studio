import "server-only"
import type { OpenRouterPricingLine } from "./types"

/** Primary sources, checked 2026-11-01:
 * https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency
 * Official calculator implementation linked from that guide:
 * https://developers.openai.com/_astro/GptImageTokenCalculator.react.FCse3GSx.js
 * https://ai.google.dev/gemini-api/docs/pricing
 * https://ai.google.dev/gemini-api/docs/image-generation#aspect_ratios_and_image_size
 * Prices themselves always come from the refreshed OpenRouter endpoint records.
 * https://openrouter.ai/docs/guides/overview/multimodal/image-generation
 */
const GPT_GRIDS: Record<string, Record<string, number>> = {
  "openai/gpt-image-2": { low: 16, medium: 48, high: 96 },
  "openai/gpt-image-2.5-flare": {
    low: 16,
    medium: 24,
    high: 48,
    xhigh: 64,
    max: 96,
  },
  "openai/gpt-image-2.5-sunburst": {
    low: 16,
    medium: 24,
    high: 48,
    xhigh: 64,
    max: 96,
  },
}
const NANO_TOKENS: Record<string, Record<string, number>> = {
  "google/gemini-3.1-flash-image": {
    "512": 747,
    "1K": 1120,
    "2K": 1680,
    "4K": 2520,
  },
  "google/gemini-nano-banana-2.1": { "1K": 1120, "2K": 1680, "4K": 3780 },
  "google/gemini-3.1-flash-lite-image": { "1K": 1120 },
  "google/gemini-3-pro-image": { "1K": 1120, "2K": 1120, "4K": 2000 },
}
function bankersRound(value: number): number {
  const lower = Math.floor(value)
  return value - lower === 0.5 ? lower + (lower % 2) : Math.round(value)
}
export function estimateGptImageOutputTokens(
  path: string,
  quality: string,
  width: number,
  height: number
): number | null {
  const grid = GPT_GRIDS[path]?.[quality]
  if (
    !grid ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width % 16 ||
    height % 16 ||
    Math.max(width, height) > 3840 ||
    Math.max(width, height) / Math.min(width, height) > 3 ||
    width * height < 655360 ||
    width * height > 8294400
  )
    return null
  const shortGrid = bankersRound(
    grid / (Math.max(width, height) / Math.min(width, height))
  )
  return Math.ceil(
    (grid * shortGrid * (2_000_000 + width * height)) / 4_000_000
  )
}
export type ConfigImageEstimate = {
  usd: number | null
  outputUsd?: number
  outputUsdRange?: { min: number; max: number }
  outputTokens?: number
  inputCostComplete: boolean
  explanation: string
}
function onlyOutputRate(pricing: OpenRouterPricingLine[]): number | null {
  const lines = pricing.filter(
    (line) =>
      line.billable === "output_image" && line.unit === "token" && !line.variant
  )
  return lines.length === 1 &&
    Number.isFinite(lines[0]!.cost_usd) &&
    lines[0]!.cost_usd >= 0
    ? lines[0]!.cost_usd
    : null
}
/** Returns a total only when every advertised billable line has a verified rule. */
export function estimateKnownImageCost(
  path: string,
  input: Record<string, unknown>,
  pricing: OpenRouterPricingLine[]
): ConfigImageEstimate | null {
  const outputRate = onlyOutputRate(pricing)
  if (outputRate === null) return null
  const count = input.n ?? 1
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 10
  )
    return null
  const references = Array.isArray(input.input_references)
    ? input.input_references.length
    : 0
  const resolution =
    typeof input.resolution === "string" ? input.resolution : ""
  const nanoTokens = NANO_TOKENS[path]?.[resolution]
  if (nanoTokens) {
    const outputUsd = nanoTokens * outputRate * count
    let inputUsd = 0
    for (const line of pricing) {
      if (
        line.billable === "output_image" &&
        line.unit === "token" &&
        !line.variant
      )
        continue
      // Google explicitly publishes 560 input-image tokens for Nano Banana Pro.
      if (
        path === "google/gemini-3-pro-image" &&
        line.billable === "input_image" &&
        line.unit === "token" &&
        !line.variant &&
        Number.isFinite(line.cost_usd) &&
        line.cost_usd >= 0
      )
        inputUsd += 560 * references * line.cost_usd
      else
        return {
          usd: null,
          outputUsd,
          outputTokens: nanoTokens * count,
          inputCostComplete: false,
          explanation:
            "The image output cost is estimated, but an additional provider billing component has no verified calculation.",
        }
    }
    return {
      usd: Number((outputUsd + inputUsd).toFixed(9)),
      outputUsd,
      outputTokens: nanoTokens * count,
      inputCostComplete: true,
      explanation:
        "Estimated total from Google's published image-token schedule and this provider's current OpenRouter rates. The completed request reports the actual USD cost.",
    }
  }
  const grid = GPT_GRIDS[path]?.[String(input.quality)]
  if (!grid) return null
  const size =
    typeof input.size === "string"
      ? /^([0-9]+)x([0-9]+)$/.exec(input.size)
      : null
  if (size) {
    const tokens = estimateGptImageOutputTokens(
      path,
      String(input.quality),
      Number(size[1]),
      Number(size[2])
    )
    if (tokens === null) return null
    return {
      usd: null,
      outputUsd: tokens * outputRate * count,
      outputTokens: tokens * count,
      inputCostComplete: false,
      explanation:
        "Estimated image output only, using OpenAI's official quality-and-dimensions calculator. Text prompt and reference-image input costs are not included, so this is not a total quote.",
    }
  }
  // The public OpenRouter GPT capabilities expose aspect_ratio but currently omit
  // explicit size. Do not invent its aspect-to-pixel mapping. Bound output over
  // the full published pixel budget instead, clearly excluding input costs.
  const ratioParts =
    typeof input.aspect_ratio === "string"
      ? /^([0-9]+):([0-9]+)$/.exec(input.aspect_ratio)
      : null
  const ratio = ratioParts
    ? Math.max(Number(ratioParts[1]), Number(ratioParts[2])) /
      Math.min(Number(ratioParts[1]), Number(ratioParts[2]))
    : null
  if (!ratio || !Number.isFinite(ratio) || ratio < 1 || ratio > 3) return null
  const product = grid * bankersRound(grid / ratio)
  const min =
    Math.ceil((product * (2_000_000 + 655360)) / 4_000_000) * outputRate * count
  const max =
    Math.ceil((product * (2_000_000 + 8294400)) / 4_000_000) *
    outputRate *
    count
  return {
    usd: null,
    outputUsdRange: { min, max },
    inputCostComplete: false,
    explanation: `Estimated image output range: $${min.toFixed(5)} to $${max.toFixed(5)}, covering OpenAI's allowed pixel sizes at this quality and ratio. The current OpenRouter schema does not fix pixel dimensions. Prompt and reference costs are extra; this range is not a total quote.`,
  }
}
