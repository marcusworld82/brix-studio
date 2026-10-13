"use server"

import { createHash } from "node:crypto"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { isSupabaseBackend } from "@/lib/backend"
import {
  signupWithPassword,
  loginWithPassword,
  requestPasswordReset,
  setPasswordFromRecovery,
} from "@/lib/supabase/password-auth"
import {
  signupSchema,
  passwordLoginSchema,
  resetPasswordSchema,
  accountEmail,
} from "@/lib/auth/password-schema"
import { createSupabaseSessionClient } from "@/lib/supabase/server"
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
    if (isSupabaseBackend())
      throw new UserFacingError(
        "Log in with your email and password. Use Forgot password if you need to set one."
      )
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
  if (isSupabaseBackend()) {
    await (await createSupabaseSessionClient()).auth.signOut()
    redirect("/")
  }
  await signOut({ redirectTo: "/" })
}

async function accountLimit(
  email: string,
  kind: "login" | "signup" | "recovery" | "reset"
) {
  if (!isSupabaseBackend())
    throw new UserFacingError(
      "Password accounts are unavailable on this backend."
    )
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const [byEmail, byIp] = await Promise.all([
    rateLimit(
      `password-${kind}:${email}`,
      kind === "login" ? 10 : 5,
      kind === "login" ? 600 : 3600
    ),
    rateLimit(`password-${kind}-ip:${ip}`, kind === "login" ? 60 : 20, 3600),
  ])
  if (!byEmail.ok || !byIp.ok)
    throw new UserFacingError(
      "Too many attempts. Wait a little and try again.",
      "RATE_LIMITED"
    )
}
export async function signupAccountAction(raw: unknown) {
  return runAction(async () => {
    const input = signupSchema.parse(raw)
    const email = normalizeEmail(input.email)
    if (env().BLOCK_DISPOSABLE_EMAIL && isDisposableEmail(email))
      throw new UserFacingError("Please use a permanent email address.")
    await accountLimit(email, "signup")
    requireEmailDelivery(email)
    return signupWithPassword(email, input.password, input.callbackUrl)
  })
}
export async function loginPasswordAction(raw: unknown) {
  return runAction(async () => {
    const input = passwordLoginSchema.parse(raw)
    const email = normalizeEmail(input.email)
    await accountLimit(email, "login")
    return loginWithPassword(email, input.password, input.callbackUrl)
  })
}
export async function requestPasswordResetAction(raw: unknown) {
  return runAction(async () => {
    const input = z.object({ email: accountEmail }).strict().parse(raw)
    const email = normalizeEmail(input.email)
    await accountLimit(email, "recovery")
    requireEmailDelivery(email)
    return requestPasswordReset(email)
  })
}
export async function setPasswordAction(raw: unknown) {
  return runAction(async () => {
    const input = resetPasswordSchema.parse(raw)
    await accountLimit(
      createHash("sha256").update(input.tokenHash).digest("hex"),
      "reset"
    )
    return setPasswordFromRecovery(input.tokenHash, input.password)
  })
}
