import { beforeEach, describe, expect, it, vi } from "vitest"

const config = vi.hoisted(() => ({
  AUTH_RESEND_KEY: undefined as string | undefined,
  E2E_TEST_MODE: true,
}))

vi.mock("@/lib/env", () => ({ env: () => config }))

import { requireEmailDelivery, sendEmail } from "@/lib/email/send"

describe("sign-in email delivery", () => {
  beforeEach(() => {
    config.AUTH_RESEND_KEY = undefined
    config.E2E_TEST_MODE = true
    vi.stubEnv("VERCEL_ENV", "development")
  })

  it("rejects real inboxes instead of claiming a local capture was sent", async () => {
    expect(() => requireEmailDelivery("owner@example.com")).toThrow(
      "Sign-in email is not configured"
    )
    await expect(
      sendEmail({
        to: "owner@example.com",
        subject: "Sign in",
        react: { type: "div", props: {}, key: null },
        text: "Sign in",
        devUrl: "http://localhost:3000/api/auth/callback/resend?token=test",
      })
    ).rejects.toMatchObject({ code: "EMAIL_NOT_CONFIGURED" })
  })

  it("allows test mailbox capture only when test mode is enabled", () => {
    expect(() => requireEmailDelivery("test@brix.test")).not.toThrow()
    config.E2E_TEST_MODE = false
    expect(() => requireEmailDelivery("test@brix.test")).toThrow()
  })

  it("does not allow test mailbox bypass on the production deployment", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    expect(() => requireEmailDelivery("test@brix.test")).toThrow()
  })

  it("allows delivery when a service key is configured", () => {
    config.AUTH_RESEND_KEY = "test-service-key"
    expect(() => requireEmailDelivery("owner@example.com")).not.toThrow()
  })
})
