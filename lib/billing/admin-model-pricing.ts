import type {
  LiveModelSummary,
  PublishedPrice,
} from "@/generation/catalog/live-types"
import type { OpenRouterModel } from "@/lib/openrouter/types"
import type { SubscriptionRateUnit } from "./subscription-rate"
export type AdminCostOption = {
  id: string
  label: string
  rateUsd: number | null
  unit: SubscriptionRateUnit | "token" | "megapixel" | "unknown"
  resolution: string | null
  images: number | null
  seconds: number | null
  fullCost: boolean
  note: string
  stale: boolean
}
export type AdminPricingModel = {
  id: string
  label: string
  provider: string
  surface: string
  previewImage?: string
  costs: AdminCostOption[]
  legacy?: boolean
}
const number = (value: unknown) => {
  const n =
    typeof value === "number" || typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}
const text = (v: unknown) => (typeof v === "string" ? v : null)
function hfOption(
  price: PublishedPrice,
  index: number,
  stale: boolean
): AdminCostOption {
  const discount = Boolean(price.discount_percentage || price.original_amount)
  const amount = number(discount ? price.original_amount : price.amount)
  const unit =
    price.unit === "image"
      ? "image"
      : price.unit === "second"
        ? "second"
        : ["request", "generation", "video"].includes(price.unit)
          ? "generation"
          : "unknown"
  const config = price.configuration ?? {}
  const resolution = text(config.resolution)
  const duration = number(config.duration_seconds ?? config.duration)
  const fullCost =
    price.currency === "USD" &&
    unit !== "unknown" &&
    (!price.qualifier || ["exact", "fixed"].includes(price.qualifier)) &&
    amount !== null
  return {
    id: `hf-${index}`,
    label:
      [
        resolution,
        duration ? `${duration}s` : null,
        text(config.quality),
        text(config.mode),
        number(config.batch_size)! > 1
          ? `${number(config.batch_size)} images`
          : null,
        number(config.fps) ? `${number(config.fps)} fps` : null,
      ]
        .filter(Boolean)
        .join(" / ") || "Published default",
    rateUsd: price.currency === "USD" ? amount : null,
    unit,
    resolution,
    images: number(config.batch_size),
    seconds: duration,
    fullCost,
    stale,
    note: discount
      ? "List price before account discounts. Discount eligibility is unverified."
      : price.qualifier && !fullCost
        ? `Published ${price.qualifier} rate. A request total is not verified.`
        : "Published list rate. Account discounts and final usage can change cost.",
  }
}
export function higgsfieldAdminModel(
  model: LiveModelSummary,
  stale: boolean
): AdminPricingModel {
  const pricing = model.pricing
  const rates = pricing
    ? pricing.options.length
      ? pricing.options
      : [pricing.primary]
    : []
  return {
    id: model.id,
    label: model.label,
    provider: "Higgsfield",
    surface: model.surface,
    previewImage: model.previewImage,
    costs: rates.map((rate, index) => hfOption(rate, index, stale)),
  }
}
export function openRouterAdminModel(
  model: OpenRouterModel
): AdminPricingModel {
  return {
    id: model.id,
    label: model.label,
    provider: "OpenRouter",
    surface: model.surface,
    costs: model.endpoints.flatMap((endpoint, endpointIndex) =>
      endpoint.pricing.map((rate, index) => ({
        id: `or-${endpointIndex}-${index}`,
        label: `${endpoint.providerName}${rate.variant ? ` / ${rate.variant}` : ""} / ${rate.billable}`,
        rateUsd: rate.cost_usd,
        unit: rate.unit,
        resolution: null,
        images: null,
        seconds: null,
        fullCost:
          endpoint.pricing.length === 1 &&
          rate.billable === "output_image" &&
          rate.unit === "image" &&
          !rate.variant,
        stale: model.stale,
        note:
          rate.unit === "token"
            ? "Token usage is unknown before generation. Margin is uncertain."
            : "Published endpoint rate. Input usage and provider routing can change final cost.",
      }))
    ),
  }
}
export function pricingComparison(
  option: AdminCostOption | undefined,
  customerRateUsd: number | null,
  customerUnit: SubscriptionRateUnit,
  preview: { images: number; seconds: number | null },
  revenueMultiplier = 1,
  creditUsd?: number
) {
  const units = (unit: string) =>
    unit === "generation"
      ? 1
      : unit === "image"
        ? preview.images
        : unit === "second"
          ? preview.seconds
          : null
  const customerQuantity = units(customerUnit)
  const rawCustomerUsd =
    customerRateUsd !== null &&
    Number.isFinite(customerRateUsd) &&
    customerRateUsd > 0 &&
    customerQuantity !== null
      ? customerRateUsd * customerQuantity
      : null
  const customerUsd =
    rawCustomerUsd !== null && creditUsd && creditUsd > 0
      ? Math.ceil(Number((rawCustomerUsd / creditUsd).toPrecision(14))) *
        creditUsd
      : rawCustomerUsd
  const providerQuantity = option ? units(option.unit) : null
  const providerUsd =
    option?.fullCost &&
    option.rateUsd !== null &&
    providerQuantity !== null &&
    !(
      option.unit === "generation" &&
      ((option.seconds !== null && preview.seconds !== option.seconds) ||
        (option.images !== null && preview.images !== option.images))
    )
      ? option.rateUsd * providerQuantity
      : null
  const profitUsd =
    providerUsd !== null && customerUsd !== null
      ? customerUsd * revenueMultiplier - providerUsd
      : null
  return { customerUsd, providerUsd, profitUsd, estimated: true as const }
}
