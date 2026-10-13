import { timingSafeEqual } from "node:crypto"

import { env } from "@/lib/env"
import { reconcile } from "@/lib/generations/reconcile"
import { json } from "@/lib/http"
import { isSupabaseBackend } from "@/lib/backend"
import { reconcileUserGenerations } from "@/lib/supabase/generations"

export const runtime = "nodejs"
export const maxDuration = 60

function authorized(request: Request): boolean {
  const secret = env().CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Vercel Cron (every minute) sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401)
  return json(
    await (isSupabaseBackend() ? reconcileUserGenerations() : reconcile())
  )
}

export const POST = GET
