import "server-only"
import {
  createSupabaseServiceClient,
  createSupabaseSessionClient,
  createSupabaseVerificationClient,
} from "./server"
import { safeReturnPath } from "./auth"
import { sendEmail } from "@/lib/email/send"
import { AccountLinkEmail } from "@/emails/account-link"
import { UserFacingError } from "@/lib/errors"
import { env } from "@/lib/env"

async function mailLink(
  email: string,
  token: string,
  kind: "signup" | "recovery",
  next?: string
) {
  const url = new URL(
    kind === "signup" ? "/auth/confirm" : "/login/reset-password",
    env().APP_URL
  )
  url.searchParams.set("token_hash", token)
  if (kind === "signup") {
    url.searchParams.set("type", "signup")
    url.searchParams.set("next", safeReturnPath(next))
  }
  const subject =
    kind === "signup" ? "Verify your BRIX email" : "Set your BRIX password"
  try {
    await sendEmail({
      to: email,
      subject,
      react: AccountLinkEmail({ url: url.toString(), kind }),
      text: `${subject}\n\n${url}\n\nThis link works once and expires in an hour. If you did not request this, ignore this email.`,
      devUrl: url.toString(),
    })
  } catch {
    throw new UserFacingError(
      "Couldn't send your email. Please try again.",
      "EMAIL_FAILED"
    )
  }
}
export async function signupWithPassword(
  email: string,
  password: string,
  next?: string
) {
  const { data, error } =
    await createSupabaseServiceClient().auth.admin.generateLink({
      type: "signup",
      email,
      password,
    })
  if (error || !data.properties?.hashed_token)
    throw new UserFacingError(
      "Couldn't create this account. If you already have an account, log in or use Forgot password.",
      "SIGNUP_FAILED"
    )
  await mailLink(email, data.properties.hashed_token, "signup", next)
  return { email }
}
export async function loginWithPassword(
  email: string,
  password: string,
  next?: string
) {
  const client = await createSupabaseSessionClient()
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })
  if (error || !data.user?.email_confirmed_at) {
    if (data.session) await client.auth.signOut({ scope: "local" })
    throw new UserFacingError(
      error?.code === "email_not_confirmed"
        ? "Verify your email before logging in."
        : "Email or password is incorrect. If you used email links before, use Forgot password to set a password.",
      "LOGIN_FAILED"
    )
  }
  return { redirectTo: safeReturnPath(next) }
}
export async function requestPasswordReset(email: string) {
  const { data, error } =
    await createSupabaseServiceClient().auth.admin.generateLink({
      type: "recovery",
      email,
    })
  // Unknown addresses receive the same response as registered ones.
  if (error) {
    if (error.code === "user_not_found" || error.status === 404)
      return { email }
    throw new UserFacingError(
      "Couldn't send a reset email. Try again shortly.",
      "EMAIL_FAILED"
    )
  }
  if (!data.properties?.hashed_token)
    throw new UserFacingError("Couldn't create a reset link.")
  await mailLink(email, data.properties.hashed_token, "recovery")
  return { email }
}
export async function setPasswordFromRecovery(
  tokenHash: string,
  password: string
) {
  const client = createSupabaseVerificationClient()
  const { data, error } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  })
  if (error || !data.user || !data.session)
    throw new UserFacingError(
      "This reset link expired or was already used. Request a fresh link.",
      "RESET_INVALID"
    )
  const { error: updateError } = await client.auth.updateUser({ password })
  await client.auth.signOut()
  if (updateError)
    throw new UserFacingError(
      "Couldn't save your password. Request a fresh reset link and try again.",
      "RESET_FAILED"
    )
  await (await createSupabaseSessionClient()).auth.signOut({ scope: "local" })
  return { redirectTo: "/login?passwordUpdated=1" }
}
