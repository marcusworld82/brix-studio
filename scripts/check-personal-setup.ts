/** Read-only configuration check. Does not connect to any external service. */
import { createRequire } from "node:module"

// Load only this project's standard Next environment files. Never read a
// home-directory credential vault or print any configuration values.
const require = createRequire(import.meta.url)
const requireFromNext = createRequire(require.resolve("next/package.json"))
requireFromNext("@next/env").loadEnvConfig(process.cwd(), false, {
  info() {},
  error() {},
})

const issues: string[] = []
const value = (name: string) => process.env[name]?.trim() ?? ""
const required = (name: string) => {
  if (!value(name)) issues.push(`${name}: missing`)
}
const url = (name: string, httpsOnly: boolean) => {
  const text = value(name)
  if (!text) {
    required(name)
    return
  }
  try {
    const parsed = new URL(text)
    if (
      !(httpsOnly
        ? parsed.protocol === "https:"
        : ["https:", "http:"].includes(parsed.protocol)) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      issues.push(`${name}: invalid URL shape`)
  } catch {
    issues.push(`${name}: invalid URL shape`)
  }
}
const secret = (name: string, min: number) => {
  required(name)
  if (
    value(name) &&
    (value(name).length < min ||
      /^(change|replace|your|example|placeholder)/i.test(value(name)))
  )
    issues.push(`${name}: invalid secret shape`)
}
const email = (name: string, requiredValue = true) => {
  if (!value(name)) {
    if (requiredValue) required(name)
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value(name)))
    issues.push(`${name}: invalid email shape`)
}
const edition = value("BRIX_EDITION") || "personal"
if (!["personal", "subscription"].includes(edition))
  issues.push("BRIX_EDITION: invalid edition")
url("APP_URL", process.env.NODE_ENV === "production")
required("NEXT_PUBLIC_BRAND_NAME")
if (
  value("NEXT_PUBLIC_BRAND_INITIALS").length < 1 ||
  value("NEXT_PUBLIC_BRAND_INITIALS").length > 4
)
  issues.push("NEXT_PUBLIC_BRAND_INITIALS: use 1 to 4 characters")
if (!/^#[\da-fA-F]{6}$/.test(value("NEXT_PUBLIC_BRAND_ACCENT")))
  issues.push("NEXT_PUBLIC_BRAND_ACCENT: use six-digit hex color")
email("NEXT_PUBLIC_SUPPORT_EMAIL", edition === "personal")
if (edition === "personal" || edition === "subscription") {
  if (value("APP_BACKEND") !== "supabase")
    issues.push("APP_BACKEND: must select supabase")
  url("NEXT_PUBLIC_SUPABASE_URL", true)
  secret("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", 20)
  secret("SUPABASE_SECRET_KEY", 20)
  secret("AUTH_RESEND_KEY", 20)
  required("API_KEY_ENCRYPTION_SECRET")
  if (
    value("API_KEY_ENCRYPTION_SECRET") &&
    !/^[\da-fA-F]{64}$/.test(value("API_KEY_ENCRYPTION_SECRET"))
  )
    issues.push("API_KEY_ENCRYPTION_SECRET: must be 64 hexadecimal characters")
  required("EMAIL_FROM")
  if (
    value("EMAIL_FROM") &&
    !/^(?:[^<>]+\s*<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(
      value("EMAIL_FROM")
    )
  )
    issues.push("EMAIL_FROM: invalid sender shape")
  secret("HF_WEBHOOK_SECRET", 32)
  secret("CRON_SECRET", 32)
  if (process.env.NODE_ENV === "production") url("HF_WEBHOOK_BASE_URL", true)
  else if (value("HF_WEBHOOK_BASE_URL")) url("HF_WEBHOOK_BASE_URL", false)
  if (value("HF_CREDENTIALS"))
    issues.push(
      "HF_CREDENTIALS: remove shared credentials from personal edition"
    )
}
if (issues.length) {
  console.error(
    "Configuration needs attention:\n" +
      [...new Set(issues)].map((issue) => `- ${issue}`).join("\n")
  )
  process.exitCode = 1
} else {
  console.log(
    edition === "subscription"
      ? "Subscription configuration shape passed. Verify database migrations and admin providers. Stripe can remain disconnected."
      : "Personal configuration shape passed. Service access, email delivery, database migrations, storage privacy and provider access still need separate verification."
  )
}
