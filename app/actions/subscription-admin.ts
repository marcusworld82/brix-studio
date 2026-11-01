"use server"
import { MODELS } from "@/generation/catalog"
import { listLiveModels } from "@/lib/higgsfield/live-catalog"
import { listOpenRouterModels } from "@/lib/openrouter/catalog"
import { requireAdmin } from "@/lib/auth/session"
import { runAction } from "@/lib/action-result"
import {
  subscriptionPricingSettings,
  subscriptionBillingReviews,
  saveSubscriptionPricingSettings,
} from "@/lib/supabase/subscription-billing"
export async function getSubscriptionPricingAction() {
  return runAction(async () => {
    await requireAdmin()
    const [settings, higgsfield, openrouter, billingReviews] =
      await Promise.all([
        subscriptionPricingSettings(),
        listLiveModels(),
        listOpenRouterModels(),
        subscriptionBillingReviews(),
      ])
    const models = [
      ...MODELS.map((m) => ({
        id: m.id,
        label: m.label,
        provider: "Higgsfield",
        surface: m.surface,
      })),
      ...higgsfield.models.map((m) => ({
        id: m.id,
        label: m.label,
        provider: "Higgsfield",
        surface: m.surface,
      })),
      ...openrouter.models.map((m) => ({
        id: m.id,
        label: m.label,
        provider: "OpenRouter",
        surface: m.surface,
      })),
    ]
    return {
      ...settings,
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
