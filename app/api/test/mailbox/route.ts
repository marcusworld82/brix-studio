import { timingSafeEqual } from "node:crypto"

import { collections } from "@/lib/db/collections"
import { isSupabaseBackend } from "@/lib/backend"
import { env } from "@/lib/env"
import { json } from "@/lib/http"

/**
 * E2E only: the latest magic link sent to an address (dev mailbox). Off unless
 * E2E_TEST_MODE is on; never on Vercel's production environment; outside
 * local development it also requires `x-e2e-secret: $E2E_SECRET`.
 */
function allowed(request: Request): boolean {
  const value = env()
  if (!value.E2E_TEST_MODE || process.env.VERCEL_ENV === "production")
    return false
  if (value.NODE_ENV === "development" || value.NODE_ENV === "test") return true
  const secret = value.E2E_SECRET
  const given = request.headers.get("x-e2e-secret") ?? ""
  return Boolean(
    secret &&
    given.length === secret.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  )
}

export async function GET(request: Request) {
  if (isSupabaseBackend() || !allowed(request))
    return json({ error: "Not found" }, 404)
  const to = new URL(request.url).searchParams.get("to")?.toLowerCase()
  if (!to) return json({ error: "Missing ?to=" }, 400)
  const { devMailbox } = await collections()
  const mail = await devMailbox.findOne({ to }, { sort: { createdAt: -1 } })
  return mail
    ? json({ url: mail.url, subject: mail.subject })
    : json({ error: "No mail" }, 404)
}
