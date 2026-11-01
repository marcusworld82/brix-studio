import "server-only"
import {
  subscriptionRateQuantity,
  subscriptionRateCredits,
} from "@/lib/billing/subscription-rate"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { z } from "zod"
import type { SessionUser } from "@/lib/auth/session"
import { UserFacingError } from "@/lib/errors"
import { checkoutSchema } from "@/lib/billing/checkout"
import { PLANS, TOPUPS, planOf, topupCredits } from "@/lib/billing/plans"
import {
  stripe,
  planPriceId,
  topupPriceId,
  planForPriceId,
  idOf,
} from "@/lib/billing/stripe"
import { enforceRateLimit } from "@/lib/rate-limit"
import { createSupabaseServiceClient } from "./server"

// Deliberately service-only. New RPCs are also represented in the migration.
async function rpc(
  name: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  const client = createSupabaseServiceClient() as unknown as SupabaseClient
  const { data, error } = await client.rpc(name, args)
  if (error)
    throw new UserFacingError(
      ["PGRST202", "42P01"].includes(error.code)
        ? "Billing setup is pending. Contact the studio owner."
        : error.message,
      "BILLING_ERROR"
    )
  return data
}
const accountSchema = z.object({
  user_id: z.uuid(),
  subscription: z.number().int().nonnegative(),
  topup: z.number().int().nonnegative(),
  plan: z.enum(["free", "starter", "plus", "ultra"]),
  customer_id: z.string().nullable(),
  subscription_id: z.string().nullable(),
  status: z.string(),
})
async function account(userId: string, customer?: string) {
  return accountSchema.parse(
    await rpc("brix_subscription_account", {
      target_user_id: z.uuid().parse(userId),
      customer: customer ?? null,
    })
  )
}
export async function subscriptionBalance(userId: string) {
  const a = await account(userId)
  return {
    total: a.subscription + a.topup,
    subscription: a.subscription,
    topup: a.topup,
    plan: a.plan,
  }
}
export const pricingSettingsSchema = z.object({
  expectedVersion: z.uuid().optional(),
  markupPercent: z.number().finite().min(0).max(10000),
  creditUsd: z.number().finite().positive().max(100),
  fixedCredits: z
    .record(
      z.string().min(1).max(220),
      z.number().int().positive().max(10000000)
    )
    .default({}),
  rateUnits: z
    .record(
      z.string().min(1).max(220),
      z.enum(["generation", "image", "second"])
    )
    .default({}),
  modelMarkups: z.record(
    z.string().min(1).max(220),
    z.number().finite().min(0).max(10000)
  ),
})
export type SubscriptionPricingSettings = z.infer<typeof pricingSettingsSchema>
export async function subscriptionPricingSettings() {
  const row = z
    .object({
      version: z.uuid(),
      markup_percent: z.coerce.number(),
      credit_usd: z.coerce.number(),
      model_markups: z.record(z.string(), z.coerce.number()),
      fixed_credits: z.record(z.string(), z.number()),
      rate_units: z
        .record(z.string(), z.enum(["generation", "image", "second"]))
        .optional(),
    })
    .parse(await rpc("brix_subscription_pricing"))
  return {
    version: row.version,
    markupPercent: row.markup_percent,
    creditUsd: row.credit_usd,
    modelMarkups: row.model_markups,
    fixedCredits: row.fixed_credits,
    rateUnits: row.rate_units ?? {},
  }
}
export async function saveSubscriptionPricingSettings(raw: unknown) {
  await rpc("brix_subscription_pricing", {
    settings: pricingSettingsSchema.parse(raw),
  })
  return subscriptionPricingSettings()
}
export async function quoteSubscriptionCost(
  userId: string,
  modelId: string,
  providerUsd: number | null,
  requestBody: Record<string, unknown> = {}
) {
  z.uuid().parse(userId)
  z.string().min(1).parse(modelId)
  if (providerUsd !== null) z.number().finite().nonnegative().parse(providerUsd)
  const p = await subscriptionPricingSettings()
  const rate = p.fixedCredits[modelId]
  if (!rate)
    throw new UserFacingError(
      "The studio owner must set a customer price for this model in Admin.",
      "PRICE_UNAVAILABLE"
    )
  const unit = p.rateUnits[modelId] ?? "generation"
  let quantity: number
  try {
    quantity = subscriptionRateQuantity(unit, requestBody)
  } catch (error) {
    throw new UserFacingError(
      error instanceof Error ? error.message : "Check the model quantity.",
      "PRICE_UNAVAILABLE"
    )
  }
  const credits = subscriptionRateCredits(rate, quantity)
  if (!Number.isSafeInteger(credits) || credits <= 0)
    throw new UserFacingError("This request is too large to price.")
  return {
    credits,
    usd: credits * p.creditUsd,
    priceVersion: p.version,
    modelId,
    providerUsd,
    unit,
    quantity,
  }
}
export async function startSubscriptionGeneration(
  userId: string,
  job: Record<string, unknown>,
  requestBody: unknown,
  quote: Awaited<ReturnType<typeof quoteSubscriptionCost>>
) {
  return z.object({ id: z.uuid(), created: z.boolean() }).parse(
    await rpc("brix_start_subscription_generation", {
      target_user_id: z.uuid().parse(userId),
      job,
      request_body: requestBody,
      quote,
    })
  )
}
export async function settleSubscriptionGeneration(
  id: string,
  outcome: "complete" | "failed"
) {
  await rpc("brix_settle_subscription_generation", {
    target_generation_id: z.uuid().parse(id),
    outcome,
  })
}
export function subscriptionCheckoutReady() {
  return Boolean(
    process.env.APP_URL &&
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    Object.values(PLANS)
      .filter((p) => p.stripePriceEnv)
      .every((p) => planPriceId(p.id, "month") && planPriceId(p.id, "year")) &&
    Object.values(TOPUPS).every((p) => topupPriceId(p.id))
  )
}
function requireBilling() {
  if (
    process.env.BRIX_EDITION !== "subscription" ||
    process.env.APP_BACKEND !== "supabase"
  )
    throw new UserFacingError(
      "Subscription billing is disabled in this edition."
    )
  if (!subscriptionCheckoutReady())
    throw new UserFacingError(
      "Payments need setup. Contact the studio owner.",
      "BILLING_DISABLED"
    )
}
async function customerFor(user: SessionUser) {
  const a = await account(user.id)
  if (a.customer_id) return a.customer_id
  const customer = await stripe().customers.create(
    {
      email: user.email,
      metadata: { userId: user.id, brixEdition: "subscription" },
    },
    { idempotencyKey: `brix-subscription-customer:${user.id}` }
  )
  return (await account(user.id, customer.id)).customer_id!
}
export async function createSubscriptionPortal(user: SessionUser) {
  requireBilling()
  await enforceRateLimit(`subscription-portal:${user.id}`, 10, 600)
  const a = await account(user.id)
  if (!a.customer_id) throw new UserFacingError("Choose a plan first.")
  const s = await stripe().billingPortal.sessions.create({
    customer: a.customer_id,
    return_url: `${process.env.APP_URL!.replace(/\/$/, "")}/account/billing`,
  })
  return { url: s.url }
}
export async function createSubscriptionCheckout(
  user: SessionUser,
  raw: unknown
) {
  requireBilling()
  const input = checkoutSchema.parse(raw)
  await enforceRateLimit(`subscription-checkout:${user.id}`, 10, 600)
  const a = await account(user.id)
  if (
    input.kind === "plan" &&
    a.subscription_id &&
    !["none", "canceled", "incomplete_expired"].includes(a.status)
  )
    return createSubscriptionPortal(user)
  const priceId =
    input.kind === "plan"
      ? planPriceId(input.plan, input.interval)
      : topupPriceId(input.pack)
  if (!priceId) throw new UserFacingError("This price needs setup.")
  const price = await stripe().prices.retrieve(priceId)
  const expected =
    input.kind === "plan"
      ? Math.round(
          (input.interval === "year"
            ? PLANS[input.plan].priceAnnualPerMonth * 12
            : PLANS[input.plan].priceMonthly) * 100
        )
      : TOPUPS[input.pack].price * 100
  if (
    !price.active ||
    price.currency !== "usd" ||
    price.unit_amount !== expected ||
    (input.kind === "plan"
      ? price.recurring?.interval !== input.interval ||
        price.recurring.interval_count !== 1
      : Boolean(price.recurring))
  )
    throw new UserFacingError(
      "The payment price does not match this plan. Contact the studio owner."
    )
  const customer = await customerFor(user)
  const metadata: Record<string, string> =
    input.kind === "plan"
      ? {
          userId: user.id,
          kind: "plan",
          plan: input.plan,
          interval: input.interval,
        }
      : {
          userId: user.id,
          kind: "topup",
          pack: input.pack,
          credits: String(topupCredits(TOPUPS[input.pack], planOf(a.plan))),
        }
  const url = process.env.APP_URL!.replace(/\/$/, "")
  const session = await stripe().checkout.sessions.create(
    {
      mode: input.kind === "plan" ? "subscription" : "payment",
      customer,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${url}/account/billing?checkout=success`,
      cancel_url: `${url}/pricing?checkout=canceled`,
      metadata,
      ...(input.kind === "plan"
        ? {
            subscription_data: {
              metadata: { userId: user.id, brixEdition: "subscription" },
            },
          }
        : { payment_intent_data: { metadata } }),
    },
    {
      idempotencyKey: `brix-checkout:${user.id}:${priceId}:${Math.floor(Date.now() / 60000)}`,
    }
  )
  if (!session.url) throw new UserFacingError("Could not start checkout.")
  return { url: session.url }
}
export async function handleSubscriptionStripeEvent(
  event: Stripe.Event
): Promise<"processed" | "duplicate" | "ignored"> {
  let payload: Record<string, unknown>
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const s = event.data.object
    if (
      s.mode !== "payment" ||
      s.payment_status !== "paid" ||
      s.metadata?.kind !== "topup"
    )
      return "ignored"
    const pack =
      TOPUPS[z.enum(["small", "medium", "large"]).parse(s.metadata.pack)]
    const credits = z.coerce
      .number()
      .int()
      .positive()
      .max(Math.floor(pack.credits * 1.2))
      .parse(s.metadata.credits)
    const items = await stripe().checkout.sessions.listLineItems(s.id, {
      limit: 2,
    })
    if (
      items.data.length !== 1 ||
      items.data[0].price?.id !== topupPriceId(pack.id) ||
      items.data[0].quantity !== 1 ||
      s.currency !== "usd" ||
      s.amount_total !== pack.price * 100
    )
      throw new Error("Top-up payment mismatch")
    payload = {
      userId: z.uuid().parse(s.client_reference_id),
      customerId: idOf(s.customer),
      credits,
      bucket: "topup",
      reference: `checkout:${s.id}`,
    }
  } else if (event.type === "invoice.paid") {
    const invoice = event.data.object
    if (
      !["subscription_create", "subscription_cycle"].includes(
        invoice.billing_reason ?? ""
      ) ||
      !invoice.id ||
      invoice.status !== "paid"
    )
      return "ignored"
    const subId = idOf(invoice.parent?.subscription_details?.subscription)
    if (!subId) return "ignored"
    const sub = await stripe().subscriptions.retrieve(subId)
    // Use the billed line, not a later subscription plan after a plan change.
    const lines = await stripe().invoices.listLineItems(invoice.id, {
      limit: 100,
    })
    const line = lines.data.find(
      (l) =>
        l.pricing?.price_details?.price &&
        planForPriceId(idOf(l.pricing.price_details.price)!)
    )
    const mapped = line
      ? planForPriceId(idOf(line.pricing?.price_details?.price)!)
      : undefined
    if (
      !mapped ||
      !line ||
      line.quantity !== 1 ||
      invoice.currency !== "usd" ||
      lines.has_more
    )
      throw new Error("Unknown subscription invoice price")
    const expected = Math.round(
      (mapped.interval === "year"
        ? PLANS[mapped.plan].priceAnnualPerMonth * 12
        : PLANS[mapped.plan].priceMonthly) * 100
    )
    if (line.amount !== expected || invoice.amount_paid !== expected)
      throw new Error("Subscription payment mismatch")
    payload = {
      userId: z.uuid().parse(sub.metadata.userId),
      customerId: idOf(invoice.customer),
      credits: PLANS[mapped.plan].monthlyCredits,
      annual: mapped.interval === "year",
      periodEnd: line.period.end,
      periodStart: line.period.start,
      bucket: "subscription",
      reference: `invoice:${invoice.id}`,
      plan: ["canceled", "incomplete_expired"].includes(sub.status)
        ? "free"
        : mapped.plan,
      status: sub.status,
      subscriptionId: sub.id,
    }
  } else if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    // Fetch current Stripe state so an old webhook cannot restore an ended plan.
    const sub = await stripe().subscriptions.retrieve(event.data.object.id)
    const mapped = planForPriceId(sub.items.data[0]?.price.id ?? "")
    payload = {
      userId: z.uuid().parse(sub.metadata.userId),
      customerId: idOf(sub.customer),
      subscriptionId: sub.id,
      status: sub.status,
      plan: ["canceled", "incomplete_expired"].includes(sub.status)
        ? "free"
        : (mapped?.plan ?? "free"),
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object
    const paymentIntent = idOf(charge.payment_intent)
    if (!paymentIntent) return "ignored"
    const sessions = await stripe().checkout.sessions.list({
      payment_intent: paymentIntent,
      limit: 1,
    })
    const session = sessions.data[0]
    if (!session?.client_reference_id) return "ignored"
    if (idOf(session.customer) !== idOf(charge.customer))
      throw new Error("Refund customer mismatch")
    payload = {
      userId: z.uuid().parse(session.client_reference_id),
      customerId: idOf(charge.customer),
      billingReview: `Refund ${charge.id}: ${charge.amount_refunded}/${charge.amount} ${charge.currency}. Review delivered credits and adjust manually.`,
      reference: `refund-review:${charge.id}:${charge.amount_refunded}`,
    }
  } else return "ignored"
  const applied = await rpc("brix_subscription_stripe_event", {
    payload: { ...payload, eventId: event.id, eventCreated: event.created },
  })
  return applied ? "processed" : "duplicate"
}

export async function refillSubscriptionAllowances() {
  return rpc("brix_refill_subscription_allowances")
}

export async function subscriptionBillingReview(userId: string) {
  const value = await rpc("brix_subscription_account", {
    target_user_id: z.uuid().parse(userId),
    customer: null,
  })
  return z.object({ billing_review: z.string().nullable() }).parse(value)
    .billing_review
}

export async function subscriptionBillingReviews() {
  return z
    .array(z.object({ userId: z.uuid(), review: z.string() }))
    .parse(await rpc("brix_subscription_billing_reviews"))
}

export async function manualModelPricingReady() {
  try {
    return (await rpc("brix_manual_pricing_ready")) === true
  } catch {
    return false
  }
}
