"use server"

import { headers } from "next/headers"
import { z } from "zod"

import { signIn, signOut } from "@/auth"
import { runAction, UserFacingError } from "@/lib/action-result"
import type { ActionResult } from "@/lib/action-types"
import { isDisposableEmail, normalizeEmail } from "@/lib/auth/disposable"
import { isE2eAddress, requireEmailDelivery } from "@/lib/email/send"
import { env } from "@/lib/env"
import { LIMITS, rateLimit } from "@/lib/rate-limit"

const schema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  callbackUrl: z.string().max(500).optional(),
})

/** Only same-site paths; never "//evil.com" or absolute URLs. */
function safeCallback(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/"
  return value
}

export async function requestMagicLinkAction(input: {
  email: string
  callbackUrl?: string
}): Promise<ActionResult<{ email: string }>> {
  return runAction(async () => {
    const parsed = schema.parse(input)
    const email = normalizeEmail(parsed.email)
    if (env().BLOCK_DISPOSABLE_EMAIL && isDisposableEmail(email))
      throw new UserFacingError(
        "Please use a permanent email address — disposable inboxes aren't supported.",
        "DISPOSABLE"
      )
    requireEmailDelivery(email)
    const ip =
      (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"
    const [byEmail, byIp] = await Promise.all([
      rateLimit(
        `magic:${email}`,
        LIMITS.magicLinkPerEmail.limit,
        LIMITS.magicLinkPerEmail.window
      ),
      isE2eAddress(email)
        ? { ok: true }
        : rateLimit(
            `magic-ip:${ip}`,
            LIMITS.magicLinkPerIp.limit,
            LIMITS.magicLinkPerIp.window
          ),
    ])
    if (!byEmail.ok)
      throw new UserFacingError(
        "We've sent several links to this address. Check your inbox (and spam), or try again in an hour.",
        "RATE_LIMITED"
      )
    if (!byIp.ok)
      throw new UserFacingError(
        "Too many sign-in attempts from this network. Try again later.",
        "RATE_LIMITED"
      )
    const result: unknown = await signIn("resend", {
      email,
      redirectTo: safeCallback(parsed.callbackUrl),
      redirect: false,
    })
    if (typeof result === "string" && /[?&]error=/.test(result))
      throw new UserFacingError(
        "We couldn't send the sign-in email. Try again in a moment.",
        "EMAIL_FAILED"
      )
    return { email }
  })
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" })
}
