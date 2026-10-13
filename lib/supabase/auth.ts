import "server-only"
import { createSupabaseServiceClient } from "./server"
import { UserFacingError } from "@/lib/errors"
import { sendEmail } from "@/lib/email/send"
import MagicLinkEmail, { magicLinkText } from "@/emails/magic-link"
import { BRAND } from "@/lib/brand"
import { env } from "@/lib/env"

export function safeReturnPath(value?: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/"
  const url = new URL(value, "https://brix.invalid")
  return url.origin === "https://brix.invalid"
    ? `${url.pathname}${url.search}${url.hash}`
    : "/"
}

/** Supabase issues the identity token; the existing Resend service mails it. */
export async function requestSupabaseLogin(email: string, next?: string) {
  const { data, error } =
    await createSupabaseServiceClient().auth.admin.generateLink({
      type: "magiclink",
      email,
    })
  if (error || !data.properties?.hashed_token)
    throw new UserFacingError(
      "Couldn't create your sign-in link. Try again shortly.",
      "EMAIL_FAILED"
    )
  const url = new URL("/auth/confirm", env().APP_URL)
  url.searchParams.set("token_hash", data.properties.hashed_token)
  url.searchParams.set("type", data.properties.verification_type)
  url.searchParams.set("next", safeReturnPath(next))
  const props = {
    url: url.toString(),
    brand: BRAND.name,
    host: url.host,
    expiresInMinutes: 60,
    supportEmail: env().SUPPORT_EMAIL,
  }
  try {
    await sendEmail({
      to: email,
      subject: `Sign in to ${BRAND.name}`,
      react: MagicLinkEmail(props),
      text: magicLinkText(props),
      devUrl: props.url,
    })
  } catch {
    throw new UserFacingError(
      "Couldn't send your sign-in email. Check that email delivery is enabled for this address.",
      "EMAIL_FAILED"
    )
  }
  return { email }
}
