import type { PublishedPricing } from "@/generation/catalog/live-types"
export type CostMedia = { kind?: string; role?: string; durationSec?: number }
export type PublishedCost = {
  usd: number
  estimated: true
  source: "published"
  explanation: string
}
const money = (v: unknown) =>
  typeof v === "string" || typeof v === "number" ? Number(v) : NaN
export function publishedFormulaSupported(path: string) {
  return (
    path.startsWith("higgsfield/genjutsu/") ||
    path.startsWith("bytedance/seedance-") ||
    path === "higgsfield/cinema-studio/4.0"
  )
}
/** Only verified billing mechanisms are calculated. Unknown descriptions fail closed. */
export function publishedCost(
  path: string,
  body: Record<string, unknown>,
  pricing: PublishedPricing | null,
  description: string,
  media: CostMedia[]
): PublishedCost | null {
  const result = (usd: number): PublishedCost | null =>
    Number.isFinite(usd) && usd >= 0
      ? {
          usd: Math.round(usd * 1e6) / 1e6,
          estimated: true,
          source: "published",
          explanation:
            "Published list-price estimate before account-specific discounts. The final charge can differ.",
        }
      : null
  const resolution = String(body.resolution ?? "").toLowerCase()
  if (path.startsWith("higgsfield/genjutsu/")) {
    const seconds = media.find(
      (m) => m.kind === "video" && m.role === "source"
    )?.durationSec
    if (
      !seconds ||
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      seconds > 30 ||
      !pricing
    )
      return null
    const rates = pricing.options
      .filter(
        (p) =>
          p.currency === "USD" &&
          p.unit === "second" &&
          String(p.configuration?.resolution).toLowerCase() === resolution
      )
      .map((p) =>
        money(
          p.original_amount ?? (!p.discount_percentage ? p.amount : undefined)
        )
      )
    if (
      !rates.length ||
      rates.some((r) => !Number.isFinite(r) || r < 0) ||
      new Set(rates).size !== 1
    )
      return null
    return result(Math.ceil(seconds) * rates[0]!)
  }
  // The provider explicitly gives approximate 16:9 per-second rates in these descriptions.
  // Do not extrapolate them to other ratios or video-reference billing.
  if (
    (path.startsWith("bytedance/seedance-") ||
      path === "higgsfield/cinema-studio/4.0") &&
    body.aspect_ratio === "16:9" &&
    !media.some((m) => m.kind === "video")
  ) {
    const seconds = Number(body.duration)
    if (
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      seconds > 30 ||
      !description.includes("16:9") ||
      !description.includes("roughly")
    )
      return null
    const rateText =
      description.split(/Each 1,000|Billable video tokens/i)[0] ?? ""
    const rates = [
      ...rateText.matchAll(
        /\$([0-9]+(?:\.[0-9]+)?)[^$]*?\bat\s+(480p|720p|1080p|4k)\b/gi
      ),
    ]
    const rate = rates.find((r) => r[2]?.toLowerCase() === resolution)
    return rate ? result(Number(rate[1]) * seconds) : null
  }
  return null
}
