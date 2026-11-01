import { beforeEach, describe, expect, it, vi } from "vitest"
const user = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  pin = "33333333-3333-4333-8333-333333333333"
const mocks = vi.hoisted(() => ({
  personalHF: vi.fn(),
  personalOR: vi.fn(),
  platformHF: vi.fn(),
  platformOR: vi.fn(),
  prepare: vi.fn(),
  hfQuote: vi.fn(),
  orQuote: vi.fn(),
  quote: vi.fn(),
  start: vi.fn(),
  settle: vi.fn(),
  submit: vi.fn(),
  generate: vi.fn(),
  status: vi.fn(),
  cancel: vi.fn(),
  upload: vi.fn(),
  rpc: vi.fn(),
  own: vi.fn(),
  getUser: vi.fn(),
  row: null as Record<string, unknown> | null,
  existing: null as Record<string, unknown> | null,
  claim: null as Record<string, unknown> | null,
  terminalRows: [] as { id: string; status: string }[],
  updates: [] as Record<string, unknown>[],
  profile: { role: "user", display_name: "Test" },
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({
    rpc: mocks.rpc,
    from: () => ({
      select: () => {
        const query = {
          eq: () => query,
          in: () => query,
          order: () => query,
          limit: async () => ({ data: mocks.terminalRows, error: null }),
          maybeSingle: async () => ({ data: mocks.existing, error: null }),
        }
        return query
      },
      update: (values: Record<string, unknown>) => {
        mocks.updates.push(values)
        const query = {
          eq: () => query,
          then: (resolve: (v: unknown) => unknown) => {
            if (mocks.row) Object.assign(mocks.row, values)
            return Promise.resolve(resolve({ error: null }))
          },
        }
        return query
      },
    }),
    storage: { from: () => ({ upload: mocks.upload }) },
  }),
  createSupabaseSessionClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mocks.profile, error: null }),
        }),
      }),
    }),
  }),
}))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/supabase/connections", () => ({
  clientForConnection: mocks.personalHF,
}))
vi.mock("@/lib/supabase/openrouter-connections", () => ({
  clientForOpenRouter: mocks.personalOR,
}))
vi.mock("@/lib/supabase/platform-connections", () => ({
  platformHiggsfieldClient: mocks.platformHF,
  platformOpenRouterClient: mocks.platformOR,
}))
vi.mock("@/lib/supabase/live-input", () => ({
  prepareLiveUserGeneration: mocks.prepare,
}))
vi.mock("@/lib/supabase/generation-cost", () => ({
  quoteGenerationCost: mocks.hfQuote,
}))
vi.mock("@/lib/openrouter/catalog", () => ({
  quoteOpenRouterInput: mocks.orQuote,
}))
vi.mock("@/lib/supabase/subscription-billing", () => ({
  quoteSubscriptionCost: mocks.quote,
  startSubscriptionGeneration: mocks.start,
  settleSubscriptionGeneration: mocks.settle,
}))
vi.mock("@/lib/supabase/library", () => ({
  generationView: async (value: unknown) => value,
  ownGeneration: mocks.own,
  jsonValue: (value: unknown) => value,
  uuid: (value: string) => value,
}))
vi.mock("@/lib/supabase/media", () => ({
  MEDIA_BUCKET: "brix-media",
  pathFromMediaUrl: vi.fn(),
  signedMediaUrl: vi.fn(),
  saveProviderOutput: vi.fn(async () => ({ path: "private/output.png" })),
}))
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }))
vi.mock("@/lib/higgsfield/webhook", () => ({
  webhookUrlFor: () => "https://studio.example/api/webhooks/higgsfield",
}))
import {
  submitUserGeneration,
  estimateUserGeneration,
  finalizeUserGeneration,
  cancelUserGeneration,
} from "@/lib/supabase/generations"
import { AmbiguousSubmitError, PlatformError } from "@/lib/higgsfield/client"
import {
  AmbiguousOpenRouterError,
  OpenRouterError,
} from "@/lib/openrouter/client"
const input = (modelId = "hf:test") => ({
  submitKey: pin,
  modelId,
  prompt: "A private portrait",
  settings: {},
  media: [],
  expectedUsd: 0.13,
  expectedCredits: 13,
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("APP_BACKEND", "supabase")
  vi.stubEnv("BRIX_EDITION", "subscription")
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com")
  mocks.row = null
  mocks.existing = null
  mocks.claim = null
  mocks.terminalRows = []
  mocks.updates = []
  mocks.prepare.mockImplementation(async (_user, raw) => ({
    model: { id: raw.modelId, label: "Test", surface: "image" },
    media: [],
    plane: { settings: {}, prompt: { text: raw.prompt } },
    request: { path: "test/model", body: { prompt: raw.prompt } },
  }))
  mocks.hfQuote.mockResolvedValue({ usd: 0.1 })
  mocks.orQuote.mockResolvedValue({ usd: 0.1 })
  mocks.quote.mockResolvedValue({
    usd: 0.13,
    credits: 13,
    providerUsd: 0.1,
    modelId: "hf:test",
    priceVersion: pin,
  })
  const hf = {
      connectionId: pin,
      client: {
        submit: mocks.submit,
        status: mocks.status,
        cancel: mocks.cancel,
      },
    },
    or = { connectionId: pin, client: { generateImage: mocks.generate } }
  mocks.personalHF.mockResolvedValue(hf)
  mocks.platformHF.mockResolvedValue(hf)
  mocks.personalOR.mockResolvedValue(or)
  mocks.platformOR.mockResolvedValue(or)
  mocks.submit.mockResolvedValue({ requestId: "hf_request", status: "queued" })
  mocks.generate.mockResolvedValue({
    requestId: "or_request",
    images: [{ bytes: new Uint8Array([1, 2]), contentType: "image/png" }],
  })
  mocks.upload.mockResolvedValue({ error: null })
  mocks.settle.mockResolvedValue(undefined)
  mocks.start.mockImplementation(async (uid, job) => {
    mocks.row = {
      ...job,
      id,
      user_id: uid,
      status: "pending_submit",
      billing_source: "subscription",
    }
    return { id, created: true }
  })
  mocks.own.mockImplementation(async () => mocks.row)
  mocks.rpc.mockImplementation(async (name) =>
    name === "brix_pending_credit_settlements"
      ? { data: mocks.terminalRows, error: null }
      : name === "brix_claim_generation"
        ? { data: mocks.claim ? [mocks.claim] : [], error: null }
        : { data: { id, created: true }, error: null }
  )
  mocks.profile = { role: "user", display_name: "Test" }
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: user,
        email: "owner@example.com",
        email_confirmed_at: "2026-01-01",
      },
    },
    error: null,
  })
})
describe("subscription generation integration", () => {
  it("requires the fresh credit quote before reserving or paying a provider", async () => {
    await expect(
      submitUserGeneration(user, { ...input(), expectedCredits: 12 })
    ).rejects.toThrow(/price changed/i)
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it("fails closed when a variable-cost model has no server credit price", async () => {
    mocks.orQuote.mockResolvedValue({ usd: null })
    mocks.quote.mockRejectedValue(
      new Error("Model needs an admin credit price")
    )
    await expect(submitUserGeneration(user, input("or:test"))).rejects.toThrow(
      /admin credit price/
    )
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it("never uses owner credentials in a personal generation", async () => {
    vi.stubEnv("BRIX_EDITION", "personal")
    await submitUserGeneration(user, { ...input(), expectedUsd: 0.1 })
    expect(mocks.personalHF).toHaveBeenCalled()
    expect(mocks.platformHF).not.toHaveBeenCalled()
    expect(mocks.platformOR).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it("pins the selected owner connection before the single paid submit", async () => {
    await submitUserGeneration(user, input())
    expect(mocks.personalHF).not.toHaveBeenCalled()
    expect(mocks.updates[0]).toEqual({ platform_connection_id: pin })
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.start.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submit.mock.invocationCallOrder[0]
    )
  })
  it("returns an existing submission without another provider POST", async () => {
    mocks.existing = { id, status: "queued" }
    await submitUserGeneration(user, input())
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it("honors an atomic reservation duplicate without paying again", async () => {
    mocks.start.mockResolvedValue({ id, created: false })
    await submitUserGeneration(user, input())
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it("keeps ambiguous OpenRouter output pending for owner review", async () => {
    mocks.generate.mockRejectedValue(
      new AmbiguousOpenRouterError(null, "or_uncertain")
    )
    const result = await submitUserGeneration(user, input("or:test"))
    expect(result).toMatchObject({
      status: "pending_submit",
      error_kind: "provider_review",
      provider_request_id: "or_uncertain",
    })
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    mocks.existing = mocks.row
    await submitUserGeneration(user, input("or:test"))
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(mocks.settle).not.toHaveBeenCalled()
  })
  it("saves successful OpenRouter images privately and settles once", async () => {
    const result = await submitUserGeneration(user, input("or:test"))
    expect(result).toMatchObject({
      status: "completed",
      outputs: [{ kind: "image", path: `${user}/outputs/${id}/0.png` }],
    })
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringContaining(user),
      expect.any(Uint8Array),
      { contentType: "image/png", upsert: false }
    )
    expect(mocks.settle).toHaveBeenCalledWith(id, "complete")
    expect(JSON.stringify(result)).not.toContain("bytes")
  })
  it("settles a definite provider failure only after the terminal write", async () => {
    mocks.generate.mockRejectedValue(new OpenRouterError(402))
    const result = await submitUserGeneration(user, input("or:test"))
    expect(result).toMatchObject({ status: "failed" })
    expect(mocks.settle).toHaveBeenCalledWith(id, "failed")
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })
  it("never refunds a completed paid image when settlement temporarily fails", async () => {
    mocks.settle.mockRejectedValueOnce(new Error("temporary DB failure"))
    await submitUserGeneration(user, input("or:test"))
    expect(mocks.row?.status).toBe("completed")
    expect(mocks.row?.error_kind).toBe("billing_pending")
    expect(mocks.settle).not.toHaveBeenCalledWith(id, "failed")
  })
  it("does not turn an ambiguous Higgsfield charge into a guessed failure", async () => {
    mocks.submit.mockRejectedValue(
      new AmbiguousSubmitError(new Error("network"))
    )
    await submitUserGeneration(user, input())
    mocks.claim = {
      ...mocks.row,
      created_at: new Date(Date.now() - 300000).toISOString(),
      finalize_lease_token: pin,
    }
    await finalizeUserGeneration(id)
    expect(mocks.row?.status).toBe("pending_submit")
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.settle).not.toHaveBeenCalledWith(id, "failed")
  })
  it("never exposes provider error bodies or API secrets in a generation result", async () => {
    const secret = "private-owner-key-never-render"
    mocks.submit.mockRejectedValue(
      new PlatformError(401, { message: secret, api_key: secret })
    )
    const result = await submitUserGeneration(user, input())
    expect(result).toMatchObject({ status: "failed" })
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(JSON.stringify(result)).not.toContain("api_key")
  })
  it("refuses OpenRouter cancel without another paid provider operation", async () => {
    mocks.row = {
      id,
      user_id: user,
      provider: "openrouter",
      billing_source: "subscription",
      status: "queued",
      provider_request_id: "or_request",
    }
    await expect(cancelUserGeneration(user, id)).rejects.toThrow(
      /cannot cancel/
    )
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(mocks.settle).not.toHaveBeenCalled()
  })
  it("uses the original pinned provider when canceling subscription work", async () => {
    mocks.row = {
      id,
      user_id: user,
      billing_source: "subscription",
      provider: "higgsfield",
      platform_connection_id: pin,
      provider_request_id: "hf_request",
      status: "queued",
    }
    mocks.claim = { ...mocks.row, finalize_lease_token: pin }
    mocks.status.mockResolvedValue({ status: "canceled" })
    await cancelUserGeneration(user, id)
    expect(mocks.platformHF).toHaveBeenCalledWith(pin)
    expect(mocks.personalHF).not.toHaveBeenCalled()
    expect(mocks.cancel).toHaveBeenCalledWith("hf_request")
    expect(mocks.settle).toHaveBeenCalledWith(id, "failed")
  })
})
describe("owner-only administration", () => {
  it("ignores a stored admin role when an explicit owner allowlist excludes the email", async () => {
    mocks.profile.role = "admin"
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: user,
          email: "outsider@example.com",
          email_confirmed_at: "2026-01-01",
        },
      },
      error: null,
    })
    const { requireAdmin } = await import("@/lib/auth/session")
    await expect(requireAdmin()).rejects.toThrow()
  })
  it("rejects unconfirmed owner email sessions", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: user,
          email: "owner@example.com",
          email_confirmed_at: null,
        },
      },
      error: null,
    })
    const { currentUser } = await import("@/lib/auth/session")
    expect(await currentUser()).toBeNull()
  })
})

describe("stored owner connection isolation", () => {
  it("never silently falls back to environment owner keys", async () => {
    vi.stubEnv("HF_CREDENTIALS", "unused-environment-owner-secret")
    vi.stubEnv("OPENROUTER_API_KEY", "unused-environment-openrouter-secret")
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    const actual = await vi.importActual<
      typeof import("@/lib/supabase/platform-connections")
    >("@/lib/supabase/platform-connections")
    expect(await actual.platformConnectionStatus("higgsfield")).toEqual({
      connected: false,
      label: undefined,
    })
    await expect(actual.platformHiggsfieldClient()).rejects.toThrow(
      /connect.*admin/i
    )
    await expect(actual.platformOpenRouterClient()).rejects.toThrow(
      /connect.*admin/i
    )
  })
  it("does not replace a missing pinned connection with the current owner key", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    const actual = await vi.importActual<
      typeof import("@/lib/supabase/platform-connections")
    >("@/lib/supabase/platform-connections")
    await expect(actual.platformHiggsfieldClient(pin)).rejects.toThrow(
      /original studio provider connection/
    )
    expect(mocks.rpc).toHaveBeenCalledWith("brix_platform_connection", {
      target_provider: "higgsfield",
      pinned_id: pin,
    })
  })
})

describe("terminal credit reconciliation", () => {
  it("retries terminal credit settlement without any provider POST", async () => {
    mocks.terminalRows = [
      { id, status: "completed" },
      { id: pin, status: "failed" },
    ]
    mocks.settle.mockRejectedValueOnce(new Error("temporary credit DB failure"))
    const { reconcileCreditSettlements } =
      await import("@/lib/supabase/settlements")
    expect(await reconcileCreditSettlements()).toEqual({
      checked: 2,
      pending: 1,
    })
    expect(mocks.rpc).toHaveBeenCalledWith("brix_pending_credit_settlements")
    expect(mocks.settle).toHaveBeenCalledWith(id, "complete")
    expect(mocks.settle).toHaveBeenCalledWith(pin, "failed")
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.generate).not.toHaveBeenCalled()
  })
})

describe("personal OpenRouter usage-price consent", () => {
  const usageQuote = {
    usd: null,
    pricing: [{ billable: "output token", unit: "token", cost_usd: 0.0001 }],
    explanation: "Final charge follows provider usage.",
  }
  beforeEach(() => {
    vi.stubEnv("BRIX_EDITION", "personal")
    mocks.orQuote.mockResolvedValue(usageQuote)
    mocks.rpc.mockImplementation(async (name, args) => {
      if (name === "brix_start_openrouter_generation") {
        mocks.row = {
          ...args.job,
          id,
          user_id: user,
          status: "pending_submit",
          billing_source: "higgsfield-api",
        }
        return { data: { id, created: true }, error: null }
      }
      return { data: [], error: null }
    })
  })
  async function consentFingerprint() {
    const estimate = await estimateUserGeneration(user, input("or:test"))
    expect(estimate).toMatchObject({
      status: "variable",
      allowUsagePrice: true,
      usd: null,
    })
    if (!("priceFingerprint" in estimate) || !estimate.priceFingerprint)
      throw new Error("Missing consent fingerprint")
    return estimate.priceFingerprint
  }
  it("still blocks an unknown total when no consent was given", async () => {
    await expect(submitUserGeneration(user, input("or:test"))).rejects.toThrow(
      /reliable generation price is unavailable/
    )
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("requires the current fingerprint even when consent is checked", async () => {
    await expect(
      submitUserGeneration(user, {
        ...input("or:test"),
        acceptVariablePrice: true,
      })
    ).rejects.toThrow(/provider rates changed/)
    await expect(
      submitUserGeneration(user, {
        ...input("or:test"),
        acceptVariablePrice: true,
        expectedPriceFingerprint: "0".repeat(64),
      })
    ).rejects.toThrow(/provider rates changed/)
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("invalidates consent when prompt, model settings, or live rates change", async () => {
    const fingerprint = await consentFingerprint()
    const accepted = {
      ...input("or:test"),
      acceptVariablePrice: true,
      expectedPriceFingerprint: fingerprint,
    }
    await expect(
      submitUserGeneration(user, {
        ...accepted,
        prompt: "A different private portrait",
      })
    ).rejects.toThrow(/provider rates changed/)
    await expect(
      submitUserGeneration(user, { ...accepted, settings: { n: 2 } })
    ).rejects.toThrow(/provider rates changed/)
    mocks.orQuote.mockResolvedValue({
      ...usageQuote,
      pricing: [{ billable: "output token", unit: "token", cost_usd: 0.0002 }],
    })
    await expect(submitUserGeneration(user, accepted)).rejects.toThrow(
      /provider rates changed/
    )
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("submits exactly once with fresh consent and stores usage cost separately", async () => {
    const fingerprint = await consentFingerprint()
    mocks.generate.mockResolvedValue({
      requestId: "or_usage",
      actualCostUsd: 0.087,
      images: [{ bytes: new Uint8Array([1, 2]), contentType: "image/png" }],
    })
    const accepted = {
      ...input("or:test"),
      expectedUsd: undefined,
      expectedCredits: undefined,
      acceptVariablePrice: true,
      expectedPriceFingerprint: fingerprint,
    }
    const result = await submitUserGeneration(user, accepted)
    expect(mocks.rpc).toHaveBeenCalledWith(
      "brix_start_openrouter_generation",
      expect.objectContaining({
        target_user_id: user,
        target_connection_id: pin,
        job: expect.objectContaining({
          provider: "openrouter",
          provider_cost_estimate: null,
        }),
      })
    )
    expect(result).toMatchObject({
      status: "completed",
      provider_cost_estimate: null,
      provider_actual_cost: 0.087,
      outputs: [{ kind: "image", path: `${user}/outputs/${id}/0.png` }],
    })
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(mocks.platformOR).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.settle).not.toHaveBeenCalled()
    mocks.existing = mocks.row
    await submitUserGeneration(user, accepted)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })
  it("cannot use usage consent to bypass subscription retail pricing", async () => {
    const fingerprint = await consentFingerprint()
    vi.stubEnv("BRIX_EDITION", "subscription")
    mocks.quote.mockRejectedValue(
      new Error("Model needs an admin credit price")
    )
    await expect(
      submitUserGeneration(user, {
        ...input("or:test"),
        acceptVariablePrice: true,
        expectedPriceFingerprint: fingerprint,
      })
    ).rejects.toThrow(/admin credit price/)
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it("cannot use OpenRouter consent to bypass unknown Higgsfield pricing", async () => {
    const fingerprint = await consentFingerprint()
    mocks.hfQuote.mockResolvedValue({ usd: null })
    await expect(
      submitUserGeneration(user, {
        ...input(),
        acceptVariablePrice: true,
        expectedPriceFingerprint: fingerprint,
      })
    ).rejects.toThrow(/reliable generation price is unavailable/)
    expect(mocks.submit).not.toHaveBeenCalled()
  })
})
