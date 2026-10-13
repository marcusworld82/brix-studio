import { stripe } from "@/lib/billing/stripe"
import { handleStripeEvent } from "@/lib/billing/stripe-events"
import { env } from "@/lib/env"
import { json } from "@/lib/http"
import { isSupabaseBackend } from "@/lib/backend"

export const runtime = "nodejs"

/** Stripe webhook: raw body + signature check, idempotent handlers. */
export async function POST(request: Request) {
  if (isSupabaseBackend()) return json({ error: "Not found" }, 404)
  const secret = env().STRIPE_WEBHOOK_SECRET
  if (!secret) return json({ error: "Stripe webhooks are not configured" }, 503)
  const signature = request.headers.get("stripe-signature")
  if (!signature) return json({ error: "Missing signature" }, 400)
  const payload = await request.text()
  let event
  try {
    event = stripe().webhooks.constructEvent(payload, signature, secret)
  } catch {
    return json({ error: "Invalid signature" }, 400)
  }
  try {
    const result = await handleStripeEvent(event)
    return json({ received: true, result })
  } catch (error) {
    // 500 makes Stripe retry; handlers are idempotent.
    console.error(`[stripe] ${event.type} ${event.id} failed`, error)
    return json({ error: "Handler failed" }, 500)
  }
}
