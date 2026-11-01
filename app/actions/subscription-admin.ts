"use server"
import {
  higgsfieldAdminModel,
  openRouterAdminModel,
  type AdminPricingModel,
} from "@/lib/billing/admin-model-pricing"
import {
  getOpenRouterModel,
  quoteOpenRouterInput,
} from "@/lib/openrouter/catalog"
import {
  creditsFromCustomerPrice,
  type SubscriptionRateUnit,
} from "@/lib/billing/subscription-rate"
import { UserFacingError } from "@/lib/errors"
import { z } from "zod"
import { MODELS } from "@/generation/catalog"
import { listLiveModels } from "@/lib/higgsfield/live-catalog"
import { listOpenRouterModels } from "@/lib/openrouter/catalog"
import { requireAdmin } from "@/lib/auth/session"
import { runAction } from "@/lib/action-result"
import {
  subscriptionPricingSettings,
  manualModelPricingReady,
  subscriptionBillingReviews,
  saveSubscriptionPricingSettings,
} from "@/lib/supabase/subscription-billing"
export async function getSubscriptionPricingAction() {
  return runAction(async () => {
    await requireAdmin()
    const [
      settingsResult,
      higgsfield,
      openrouter,
      billingReviews,
      pricingReady,
    ] = await Promise.all([
      subscriptionPricingSettings().catch(() => null),
      listLiveModels(),
      listOpenRouterModels(),
      subscriptionBillingReviews().catch(() => []),
      manualModelPricingReady(),
    ])
    const settings: {
      version: string | null
      creditUsd: number
      markupPercent: number
      modelMarkups: Record<string, number>
      fixedCredits: Record<string, number>
      rateUnits: Record<string, SubscriptionRateUnit>
    } = settingsResult ?? {
      version: null,
      creditUsd: 0.01,
      markupPercent: 0,
      modelMarkups: {},
      fixedCredits: {},
      rateUnits: {},
    }
    const models: AdminPricingModel[] = [
      ...higgsfield.models.map((m) =>
        higgsfieldAdminModel(m, higgsfield.stale)
      ),
      ...openrouter.models.map(openRouterAdminModel),
    ]
    const liveIds = new Set(models.map((model) => model.id))
    for (const id of new Set([
      ...Object.keys(settings.fixedCredits),
      ...Object.keys(settings.modelMarkups),
    ])) {
      if (liveIds.has(id)) continue
      const old = MODELS.find((model) => model.id === id)
      models.push({
        id,
        label: old?.label ?? id,
        provider: id.startsWith("or:") ? "OpenRouter" : "Higgsfield",
        surface: old?.surface ?? "unavailable",
        costs: [],
        legacy: true,
      })
    }
    return {
      ...settings,
      pricingReady: pricingReady && settingsResult !== null,
      setupMessage:
        pricingReady && settingsResult !== null
          ? null
          : "Pricing setup is pending. Model rates are available to review, but saving is disabled until the subscription migrations are applied.",
      billingReviews,
      models: Array.from(new Map(models.map((m) => [m.id, m])).values()).sort(
        (a, b) => a.label.localeCompare(b.label)
      ),
    }
  })
}
export async function saveSubscriptionPricingAction(input: unknown) {
  return runAction(async () => {
    await requireAdmin()
    return saveSubscriptionPricingSettings(input)
  })
}

export async function getAdminModelCostAction(modelId: string) {
  return runAction(async () => {
    await requireAdmin()
    const id = z.string().min(1).max(220).parse(modelId)
    if (!id.startsWith("or:"))
      throw new UserFacingError("Select an OpenRouter model.")
    const model = await getOpenRouterModel(id)
    if (!model) throw new UserFacingError("Provider rates are unavailable.")
    const row = openRouterAdminModel(model)
    try {
      const previewInput: Record<string, unknown> = {
        ...model.defaults,
        prompt: "Preview",
        n: 1,
      }
      const quote = await quoteOpenRouterInput(model, previewInput)
      if (quote.usd !== null || quote.outputUsd !== undefined) {
        const config = [
          typeof previewInput.resolution === "string"
            ? previewInput.resolution
            : null,
          typeof previewInput.quality === "string"
            ? previewInput.quality
            : null,
          "1 image",
          "no references",
        ]
          .filter(Boolean)
          .join(" / ")
        row.costs.unshift({
          id: "or-configured-preview",
          label: config,
          rateUsd: quote.usd ?? quote.outputUsd ?? null,
          unit: "generation",
          resolution:
            typeof previewInput.resolution === "string"
              ? previewInput.resolution
              : null,
          images: 1,
          seconds: null,
          fullCost: quote.usd !== null,
          note:
            quote.usd !== null
              ? quote.explanation
              : "Image output only. Prompt and reference-image costs are not included. Gross profit is uncertain.",
          stale: model.stale,
        })
      }
    } catch {
      /* Keep verified rates when a complete preview configuration is unavailable. */
    }
    return row
  })
}
export async function saveManualModelPricesAction(raw: unknown) {
  return runAction(async () => {
    await requireAdmin()
    if (!(await manualModelPricingReady()))
      throw new UserFacingError(
        "Pricing setup is pending. Apply the subscription migrations before saving."
      )
    const input = z
      .object({
        version: z.uuid(),
        prices: z.record(
          z.string().min(1).max(220),
          z.object({
            usd: z.number().finite().positive().max(1000000000),
            unit: z.enum(["generation", "image", "second"]),
          })
        ),
      })
      .parse(raw)
    const settings = await subscriptionPricingSettings()
    if (settings.version !== input.version)
      throw new UserFacingError(
        "Pricing changed in another tab. Refresh before saving."
      )
    for (const price of Object.values(input.prices)) {
      try {
        creditsFromCustomerPrice(price.usd, settings.creditUsd)
      } catch (error) {
        throw new UserFacingError(
          error instanceof Error ? error.message : "Check the customer price."
        )
      }
    }
    const fixedCredits = Object.fromEntries(
      Object.entries(input.prices).map(([id, price]) => [
        id,
        creditsFromCustomerPrice(price.usd, settings.creditUsd),
      ])
    )
    const rateUnits = Object.fromEntries(
      Object.entries(input.prices).map(([id, price]) => [id, price.unit])
    )
    return saveSubscriptionPricingSettings({
      ...settings,
      fixedCredits,
      rateUnits,
      expectedVersion: input.version,
    })
  })
}
