import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  encryptOpenRouterCredentials,
  decryptOpenRouterCredentials,
} from "@/lib/openrouter/credential-cipher"
import {
  encryptCredentials,
  decryptCredentials,
} from "@/lib/supabase/credential-cipher"
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({ rpc: mocks.rpc }),
  createSupabaseSessionClient: async () => ({ auth: { getUser: mocks.user } }),
}))
import {
  connectionStatus,
  saveConnection,
  disconnectConnection,
  clientForOpenRouter,
} from "@/lib/supabase/openrouter-connections"
const secret = "12".repeat(32)
const key = "opaque-openrouter-test-token"
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("BRIX_EDITION", "personal")
  vi.stubEnv("API_KEY_ENCRYPTION_SECRET", secret)
  mocks.user.mockResolvedValue({
    data: { user: { id: "owner", email_confirmed_at: "2026-11-01" } },
    error: null,
  })
  mocks.rpc.mockResolvedValue({ data: null, error: null })
})
afterAll(() => vi.unstubAllEnvs())
describe("OpenRouter key encryption", () => {
  it("binds encrypted keys to both owner and provider domain", () => {
    const ciphertext = encryptOpenRouterCredentials(key, "owner", secret)
    expect(ciphertext).not.toContain(key)
    expect(decryptOpenRouterCredentials(ciphertext, "owner", secret)).toBe(key)
    expect(() =>
      decryptOpenRouterCredentials(ciphertext, "other", secret)
    ).toThrow()
    expect(() => decryptCredentials(ciphertext, "owner", secret)).toThrow()
    expect(() =>
      decryptOpenRouterCredentials(
        encryptCredentials(key, "owner", secret),
        "owner",
        secret
      )
    ).toThrow()
    expect(encryptOpenRouterCredentials(key, "owner", secret)).not.toBe(
      ciphertext
    )
  })
  it("rejects weak secrets, injection headers and modified ciphertext", () => {
    expect(() => encryptOpenRouterCredentials(key, "owner", "weak")).toThrow()
    expect(() =>
      encryptOpenRouterCredentials(
        "token\r\nAuthorization: bad",
        "owner",
        secret
      )
    ).toThrow()
    const ciphertext = encryptOpenRouterCredentials(key, "owner", secret)
    expect(() =>
      decryptOpenRouterCredentials(
        ciphertext.slice(0, -2) + (ciphertext.endsWith("ff") ? "00" : "ff"),
        "owner",
        secret
      )
    ).toThrow()
  })
})
describe("per-user OpenRouter connections", () => {
  it("saves only owner-scoped ciphertext and a masked label, without a provider call", async () => {
    await saveConnection(key)
    const [name, args] = mocks.rpc.mock.calls[0]!
    expect(name).toBe("brix_openrouter_put_connection")
    expect(args.target_user_id).toBe("owner")
    expect(args.masked_label).toBe(`•••• ${key.slice(-4)}`)
    expect(args.ciphertext).not.toContain(key)
    expect(decryptOpenRouterCredentials(args.ciphertext, "owner", secret)).toBe(
      key
    )
  })
  it("returns only masked connection status", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          key_label: "•••• test",
          created_at: "2026-11-01",
          encrypted_credentials: "must-not-leak",
        },
      ],
      error: null,
    })
    expect(await connectionStatus()).toEqual({
      connected: true,
      label: "•••• test",
      savedAt: "2026-11-01",
    })
    expect(mocks.rpc.mock.calls[0]).toEqual([
      "brix_openrouter_connection_status",
      { target_user_id: "owner" },
    ])
  })
  it("rejects unverified sessions and subscription access to personal keys", async () => {
    mocks.user.mockResolvedValue({
      data: { user: { id: "owner" } },
      error: null,
    })
    await expect(saveConnection(key)).rejects.toThrow("Sign in")
    expect(mocks.rpc).not.toHaveBeenCalled()
    vi.stubEnv("BRIX_EDITION", "subscription")
    await expect(clientForOpenRouter("owner")).rejects.toThrow("subscription")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("does not fall back to the owner key when a personal connection is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "owner-key-must-not-be-used")
    await expect(clientForOpenRouter("owner")).rejects.toMatchObject({
      code: "API_KEY_REQUIRED",
    })
  })
  it("pins the requested owner's connection ID and disconnects only the session owner", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          id: "pinned",
          encrypted_credentials: encryptOpenRouterCredentials(
            key,
            "owner",
            secret
          ),
        },
      ],
      error: null,
    })
    const connection = await clientForOpenRouter("owner", "pinned")
    expect(connection.connectionId).toBe("pinned")
    expect(mocks.rpc.mock.calls[0]).toEqual([
      "brix_openrouter_get_connection",
      { target_user_id: "owner", target_connection_id: "pinned" },
    ])
    await disconnectConnection()
    expect(mocks.rpc.mock.calls[1]).toEqual([
      "brix_openrouter_disconnect_connection",
      { target_user_id: "owner" },
    ])
  })
})
