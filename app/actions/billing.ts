"use server"

import { runAction } from "@/lib/action-result"
import type { ActionResult } from "@/lib/action-types"
import { requireUser } from "@/lib/auth/session"
import {
  createSubscriptionCheckout,
  createSubscriptionPortal,
} from "@/lib/supabase/subscription-billing"
import { isSupabaseBackend } from "@/lib/backend"
import { UserFacingError } from "@/lib/errors"
import {
  createCheckoutSession,
  createPortalSession,
} from "@/lib/billing/checkout"

export async function checkoutAction(
  input:
    | {
        kind: "plan"
        plan: "starter" | "plus" | "ultra"
        interval: "month" | "year"
      }
    | { kind: "topup"; pack: "small" | "medium" | "large" }
): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const user = await requireUser()
    if (isSupabaseBackend() && process.env.BRIX_EDITION === "subscription")
      return createSubscriptionCheckout(user, input)
    if (isSupabaseBackend())
      throw new UserFacingError(
        "Generation billing is handled by your Higgsfield API account."
      )
    return createCheckoutSession(user, input)
  })
}

export async function portalAction(): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const user = await requireUser()
    if (isSupabaseBackend() && process.env.BRIX_EDITION === "subscription")
      return createSubscriptionPortal(user)
    if (isSupabaseBackend())
      throw new UserFacingError(
        "Generation billing is handled by your Higgsfield API account."
      )
    return createPortalSession(user)
  })
}
