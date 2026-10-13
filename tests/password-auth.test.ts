import { beforeEach, describe, it, expect, vi } from "vitest"
const m = vi.hoisted(() => ({
  generateLink: vi.fn(),
  sendEmail: vi.fn(),
  signIn: vi.fn(),
  sessionSignOut: vi.fn(),
  verify: vi.fn(),
  update: vi.fn(),
  verificationSignOut: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({
    auth: { admin: { generateLink: m.generateLink } },
  }),
  createSupabaseSessionClient: async () => ({
    auth: { signInWithPassword: m.signIn, signOut: m.sessionSignOut },
  }),
  createSupabaseVerificationClient: () => ({
    auth: {
      verifyOtp: m.verify,
      updateUser: m.update,
      signOut: m.verificationSignOut,
    },
  }),
}))
vi.mock("@/lib/email/send", () => ({ sendEmail: m.sendEmail }))
vi.mock("@/lib/env", () => ({
  env: () => ({ APP_URL: "https://brix.example", SUPPORT_EMAIL: "" }),
}))
vi.mock("@/emails/account-link", () => ({ AccountLinkEmail: () => null }))
vi.mock("@/lib/backend", () => ({ isSupabaseBackend: () => true }))
import {
  signupWithPassword,
  loginWithPassword,
  requestPasswordReset,
  setPasswordFromRecovery,
} from "@/lib/supabase/password-auth"
import { signupSchema, resetPasswordSchema } from "@/lib/auth/password-schema"
import { GET } from "@/app/auth/confirm/route"
beforeEach(() => {
  vi.clearAllMocks()
  m.sessionSignOut.mockResolvedValue({ error: null })
  m.verificationSignOut.mockResolvedValue({ error: null })
  m.sendEmail.mockResolvedValue(undefined)
})
describe("Password accounts", () => {
  it("requires consent, matching passwords, and eight characters", () => {
    const v = {
      email: "person@example.com",
      password: "Correct-password1",
      confirmPassword: "Correct-password1",
      consent: true,
    }
    expect(signupSchema.safeParse(v).success).toBe(true)
    for (const bad of [
      { consent: false },
      { confirmPassword: "wrong" },
      { password: "short", confirmPassword: "short" },
      { role: "admin" },
    ])
      expect(signupSchema.safeParse({ ...v, ...bad }).success).toBe(false)
    expect(
      resetPasswordSchema.safeParse({
        tokenHash: "x",
        password: v.password,
        confirmPassword: v.password,
      }).success
    ).toBe(false)
  })
  it("sends verification without returning its token or password", async () => {
    m.generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "a".repeat(64) } },
      error: null,
    })
    expect(
      await signupWithPassword(
        "person@example.com",
        "Correct-password1",
        "//evil.example"
      )
    ).toEqual({ email: "person@example.com" })
    const mail = m.sendEmail.mock.calls[0]![0]
    const u = new URL(mail.devUrl)
    expect(u.pathname).toBe("/auth/confirm")
    expect(u.searchParams.get("type")).toBe("signup")
    expect(u.searchParams.get("next")).toBe("/")
    expect(m.generateLink).toHaveBeenCalledWith({
      type: "signup",
      email: "person@example.com",
      password: "Correct-password1",
    })
  })
  it("does not overwrite an existing account when signup fails", async () => {
    m.generateLink.mockResolvedValue({
      data: {},
      error: { code: "email_exists" },
    })
    await expect(
      signupWithPassword("existing@example.com", "Another-password1")
    ).rejects.toThrow(/already have an account/)
    expect(m.sendEmail).not.toHaveBeenCalled()
  })
  it("rejects wrong passwords and unverified users", async () => {
    m.signIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "invalid_credentials" },
    })
    await expect(loginWithPassword("p@example.com", "bad")).rejects.toThrow(
      /incorrect/
    )
    m.signIn.mockResolvedValue({
      data: { user: { id: "u", email_confirmed_at: null }, session: {} },
      error: null,
    })
    await expect(
      loginWithPassword("p@example.com", "password")
    ).rejects.toThrow()
    expect(m.sessionSignOut).toHaveBeenCalledWith({ scope: "local" })
  })
  it("logs in a verified user without sending another email", async () => {
    m.signIn.mockResolvedValue({
      data: {
        user: { id: "u", email_confirmed_at: "2026-10-13" },
        session: {},
      },
      error: null,
    })
    expect(
      await loginWithPassword("p@example.com", "password", "/video")
    ).toEqual({ redirectTo: "/video" })
    expect(m.sendEmail).not.toHaveBeenCalled()
  })
  it("does not reveal whether a reset address exists", async () => {
    m.generateLink.mockResolvedValue({
      data: {},
      error: { code: "user_not_found" },
    })
    expect(await requestPasswordReset("missing@example.com")).toEqual({
      email: "missing@example.com",
    })
    expect(m.sendEmail).not.toHaveBeenCalled()
  })
  it("invalid reset tokens cannot change a password", async () => {
    m.verify.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "otp_expired" },
    })
    await expect(
      setPasswordFromRecovery("b".repeat(64), "New-password1")
    ).rejects.toThrow(/expired/)
    expect(m.update).not.toHaveBeenCalled()
  })
  it("resets only the recovery session owner and returns to login", async () => {
    m.verify.mockResolvedValue({
      data: { user: { id: "recovery-owner" }, session: {} },
      error: null,
    })
    m.update.mockResolvedValue({ error: null })
    expect(
      await setPasswordFromRecovery("b".repeat(64), "New-password1")
    ).toEqual({ redirectTo: "/login?passwordUpdated=1" })
    expect(m.verify).toHaveBeenCalledWith({
      token_hash: "b".repeat(64),
      type: "recovery",
    })
    expect(m.update).toHaveBeenCalledWith({ password: "New-password1" })
    expect(m.verificationSignOut).toHaveBeenCalled()
    expect(m.sessionSignOut).toHaveBeenCalledWith({ scope: "local" })
  })
  it("verification returns to login without authenticating the browser", async () => {
    m.verify.mockResolvedValue({
      data: { user: { id: "new-user" } },
      error: null,
    })
    const response = await GET(
      new Request(
        `https://brix.example/auth/confirm?token_hash=${"c".repeat(64)}&type=signup&next=/video`
      )
    )
    const url = new URL(response.headers.get("location")!)
    expect(url.pathname).toBe("/login")
    expect(url.searchParams.get("verified")).toBe("1")
    expect(url.searchParams.get("callbackUrl")).toBe("/video")
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(m.sessionSignOut).toHaveBeenCalled()
  })
  it("old magic links and replayed confirmations do not log in", async () => {
    const old = await GET(
      new Request(
        "https://brix.example/auth/confirm?token_hash=old&type=magiclink"
      )
    )
    expect(old.headers.get("location")).toContain("/login/error")
    expect(m.verify).not.toHaveBeenCalled()
    m.verify.mockResolvedValue({ data: {}, error: { code: "otp_expired" } })
    const replay = await GET(
      new Request(
        `https://brix.example/auth/confirm?token_hash=${"c".repeat(64)}&type=signup`
      )
    )
    expect(replay.headers.get("location")).toContain("/login/error")
  })
})
