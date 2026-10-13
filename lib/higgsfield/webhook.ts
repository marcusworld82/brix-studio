import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import { env } from "@/lib/env"

/**
 * The docs describe no webhook signature, so each webhook URL carries the
 * generation id and an HMAC of it; the handler recomputes and compares in
 * constant time, then re-fetches the status instead of trusting the payload.
 */
export function webhookToken(generationId: string, secret: string): string {
  return createHmac("sha256", secret).update(generationId).digest("hex")
}

export function verifyWebhookToken(
  generationId: string,
  token: string,
  secret: string
): boolean {
  if (
    !/^(?:[a-f0-9]{24}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(
      generationId
    ) ||
    !/^[a-f0-9]{64}$/.test(token)
  )
    return false
  const expected = Buffer.from(webhookToken(generationId, secret), "hex")
  const given = Buffer.from(token, "hex")
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** Full hf_webhook URL for a generation, or undefined when webhooks are off. */
export function webhookUrlFor(generationId: string): string | undefined {
  const value = env()
  const secret = value.HF_WEBHOOK_SECRET
  const base =
    value.HF_WEBHOOK_BASE_URL ??
    (value.APP_BACKEND === "supabase" && value.NODE_ENV === "production"
      ? value.APP_URL
      : undefined)
  if (!base || !secret) return undefined
  const url = new URL("/api/webhooks/higgsfield", base)
  url.searchParams.set("gid", generationId)
  url.searchParams.set("t", webhookToken(generationId, secret))
  return url.toString()
}
