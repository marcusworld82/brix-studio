import type { Surface } from "@/generation/catalog/types"

/**
 * Plans and top-up packs. Prices are SUGGESTED defaults pending the owner's
 * final numbers (see docs/decisions.md → Plans); Stripe price IDs come from env.
 * Retail value of one credit is CREDIT_USD_VALUE (default $0.01).
 */

export type PlanId = "free" | "starter" | "plus" | "ultra"
export type BillingInterval = "month" | "year"
export type TopupId = "small" | "medium" | "large"

export interface Plan {
  id: PlanId
  name: string
  tagline: string
  /** Credits granted each month (subscription bucket is reset to this). */
  monthlyCredits: number
  /** USD per month when billed monthly / per month when billed annually. */
  priceMonthly: number
  priceAnnualPerMonth: number
  /** Parallel generations per surface. */
  concurrency: Record<Surface, number>
  /** Top-up credits per dollar multiplier (higher plans get more). */
  topupMultiplier: number
  badge?: "MOST POPULAR" | "BEST VALUE"
  features: { label: string; included: boolean; tag?: string }[]
  stripePriceEnv?: { month: string; year: string }
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Try every model with your sign-up credits",
    monthlyCredits: 0,
    priceMonthly: 0,
    priceAnnualPerMonth: 0,
    concurrency: { image: 1, video: 1, audio: 1 },
    topupMultiplier: 1,
    features: [
      { label: "Every image and video model", included: true },
      { label: "Personal library and projects", included: true },
      { label: "Save your own templates", included: true },
      { label: "Parallel generations", included: false },
      { label: "Commercial use", included: false },
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For creators getting started",
    monthlyCredits: 1_000,
    priceMonthly: 12,
    priceAnnualPerMonth: 9.6,
    concurrency: { image: 4, video: 2, audio: 2 },
    topupMultiplier: 1.05,
    features: [
      { label: "1,000 credits every month", included: true },
      { label: "2 video + 4 image generations at once", included: true },
      { label: "Commercial use", included: true },
      { label: "5% bonus on credit top-ups", included: true },
      { label: "Priority queue", included: false },
    ],
    stripePriceEnv: {
      month: "STRIPE_PRICE_STARTER_MONTHLY",
      year: "STRIPE_PRICE_STARTER_ANNUAL",
    },
  },
  plus: {
    id: "plus",
    name: "Plus",
    tagline: "For daily creators and small teams",
    monthlyCredits: 3_500,
    priceMonthly: 35,
    priceAnnualPerMonth: 28,
    concurrency: { image: 8, video: 6, audio: 4 },
    topupMultiplier: 1.1,
    badge: "MOST POPULAR",
    features: [
      { label: "3,500 credits every month", included: true },
      { label: "6 video + 8 image generations at once", included: true },
      { label: "Commercial use", included: true },
      { label: "10% bonus on credit top-ups", included: true, tag: "BONUS" },
      { label: "Priority queue", included: true },
    ],
    stripePriceEnv: {
      month: "STRIPE_PRICE_PLUS_MONTHLY",
      year: "STRIPE_PRICE_PLUS_ANNUAL",
    },
  },
  ultra: {
    id: "ultra",
    name: "Ultra",
    tagline: "For studios shipping every day",
    monthlyCredits: 9_000,
    priceMonthly: 89,
    priceAnnualPerMonth: 71.2,
    concurrency: { image: 12, video: 8, audio: 6 },
    topupMultiplier: 1.2,
    badge: "BEST VALUE",
    features: [
      { label: "9,000 credits every month", included: true },
      { label: "8 video + 12 image generations at once", included: true },
      { label: "Commercial use", included: true },
      { label: "20% bonus on credit top-ups", included: true, tag: "BONUS" },
      { label: "Priority queue", included: true },
    ],
    stripePriceEnv: {
      month: "STRIPE_PRICE_ULTRA_MONTHLY",
      year: "STRIPE_PRICE_ULTRA_ANNUAL",
    },
  },
}

export const PAID_PLANS = [PLANS.starter, PLANS.plus, PLANS.ultra] as const

export interface TopupPack {
  id: TopupId
  name: string
  credits: number
  price: number
  stripePriceEnv: string
}

export const TOPUPS: Record<TopupId, TopupPack> = {
  small: {
    id: "small",
    name: "Boost",
    credits: 500,
    price: 5,
    stripePriceEnv: "STRIPE_PRICE_TOPUP_SMALL",
  },
  medium: {
    id: "medium",
    name: "Pack",
    credits: 2_200,
    price: 20,
    stripePriceEnv: "STRIPE_PRICE_TOPUP_MEDIUM",
  },
  large: {
    id: "large",
    name: "Crate",
    credits: 6_000,
    price: 50,
    stripePriceEnv: "STRIPE_PRICE_TOPUP_LARGE",
  },
}

export function planOf(id: string | undefined | null): Plan {
  return id && id in PLANS ? PLANS[id as PlanId] : PLANS.free
}

/** Credits a top-up grants on a given plan (bonus for higher tiers). */
export function topupCredits(pack: TopupPack, plan: Plan): number {
  return Math.floor(pack.credits * plan.topupMultiplier)
}

export function annualSavingsPercent(plan: Plan): number {
  if (!plan.priceMonthly) return 0
  return Math.round((1 - plan.priceAnnualPerMonth / plan.priceMonthly) * 100)
}
