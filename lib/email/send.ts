import "server-only"

import type { ReactElement } from "react"
import { ObjectId } from "mongodb"
import { Resend } from "resend"

import { collections } from "@/lib/db/collections"
import { env } from "@/lib/env"
import { UserFacingError } from "@/lib/errors"

/**
 * Transactional email through Resend. Real sign-in addresses require a service
 * key. Reserved .test addresses use the test mailbox when E2E mode is enabled.
 * Other development messages without a key are printed to the server log.
 */
let resend: Resend | undefined

/**
 * E2E runs (local or a preview deploy, never Vercel production) sign in with
 * addresses on the reserved `.test` TLD (RFC 2606). Those can't receive mail,
 * so they're kept in the test mailbox only and skip the per-IP send limits.
 */
export function isE2eAddress(email: string): boolean {
  return (
    env().E2E_TEST_MODE &&
    process.env.VERCEL_ENV !== "production" &&
    email.toLowerCase().endsWith(".test")
  )
}

/** Never tell a real user to check an inbox when delivery is disabled. */
export function requireEmailDelivery(email: string): void {
  if (!env().AUTH_RESEND_KEY && !isE2eAddress(email))
    throw new UserFacingError(
      "Sign-in email is not configured yet. The site owner needs to connect an email service before you can sign in.",
      "EMAIL_NOT_CONFIGURED"
    )
}

export async function sendEmail(input: {
  to: string
  subject: string
  react: ReactElement
  text: string
  /** The link a dev/test reader needs (magic link). */
  devUrl?: string
}): Promise<void> {
  const value = env()
  if (input.devUrl) requireEmailDelivery(input.to)
  // E2E runs (local or a preview deploy) read magic links from the test mailbox.
  const capture =
    Boolean(input.devUrl) &&
    ((value.E2E_TEST_MODE && process.env.VERCEL_ENV !== "production") ||
      (!value.AUTH_RESEND_KEY && value.NODE_ENV !== "production"))
  if (capture) await storeDevMail(input.to, input.subject, input.devUrl!)
  if (capture && isE2eAddress(input.to)) return
  if (value.AUTH_RESEND_KEY) {
    resend ??= new Resend(value.AUTH_RESEND_KEY)
    const { error } = await resend.emails.send({
      from: value.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      react: input.react,
      text: input.text,
    })
    if (error) throw new Error(`Email delivery failed: ${error.message}`)
    return
  }
  if (value.NODE_ENV === "production")
    throw new Error("AUTH_RESEND_KEY is required to send email in production")
  console.info(
    `\n[email:dev] To: ${input.to}\n[email:dev] Subject: ${input.subject}\n${
      input.devUrl ? `[email:dev] Link: ${input.devUrl}\n` : ""
    }`
  )
}

async function storeDevMail(
  to: string,
  subject: string,
  url: string
): Promise<void> {
  const { devMailbox } = await collections()
  await devMailbox.insertOne({
    _id: new ObjectId(),
    to: to.toLowerCase(),
    subject,
    url,
    createdAt: new Date(),
  })
}
