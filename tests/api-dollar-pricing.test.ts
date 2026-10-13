import { beforeEach, describe, expect, it, vi } from "vitest"
import { formatUsd } from "@/lib/billing/usd"
import {
  EstimateDescriptionError,
  PlatformError,
  createHiggsfieldClient,
} from "@/lib/higgsfield/client"

const mocks = vi.hoisted(() => ({
  estimate: vi.fn(),
  submit: vi.fn(),
  rpc: vi.fn(),
  info: vi.fn(),
  rate: vi.fn(),
  sign: vi.fn(),
}))
vi.mock("@/lib/supabase/connections", () => ({
  clientForConnection: async () => ({
    connectionId: "owner-connection",
    client: { estimate: mocks.estimate, submit: mocks.submit },
  }),
}))
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.rate }))
vi.mock("@/generation/catalog", () => ({
  findModel: (id: string) =>
    id === "test" ? { id, surface: "video", label: "Test" } : undefined,
  parseSettings: (_: unknown, settings: unknown) => settings,
}))
vi.mock("@/generation/catalog/media-inputs", () => ({
  inferInputMode: () => "text",
  groupMedia: (media: unknown) => media,
}))
vi.mock("@/generation/to-platform", () => ({
  toPlatform: (plane: { settings: object; prompt: { text: string } }) => ({
    path: "test/video",
    body: { ...plane.settings, prompt: plane.prompt.text },
  }),
}))
vi.mock("@/lib/supabase/media", () => ({
  MEDIA_BUCKET: "test",
  pathFromMediaUrl: (url: string, owner: string) => {
    if (!url.includes(owner)) throw new Error("Not owned")
    return "owned"
  },
  signedMediaUrl: mocks.sign,
  saveProviderOutput: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null }),
      update: () => chain,
    }
    return {
      from: () => chain,
      rpc: mocks.rpc,
      storage: { from: () => ({ info: mocks.info }) },
    }
  },
}))
vi.mock("@/lib/supabase/library", () => ({
  jsonValue: (v: unknown) => v,
  uuid: (v: string) => v,
  ownGeneration: async () => ({ status: "queued" }),
  generationView: (v: unknown) => v,
}))
vi.mock("@/lib/higgsfield/webhook", () => ({
  webhookUrlFor: () => "https://example.com/webhook",
}))
import {
  estimateUserGeneration,
  submitUserGeneration,
} from "@/lib/supabase/generations"

const input = {
  submitKey: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  modelId: "test",
  prompt: "A test",
  media: [],
  settings: { resolution: "720p", duration: 5 },
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.estimate.mockResolvedValue({ usd: 1.56, credits: 99 })
  mocks.rpc.mockResolvedValue({
    data: { id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", created: true },
    error: null,
  })
  mocks.submit.mockResolvedValue({ requestId: "test-job", status: "queued" })
})
describe("API dollar pricing", () => {
  it("keeps provider USD precision and the dollar symbol", () => {
    expect(formatUsd(1.56)).toBe("$1.56")
    expect(formatUsd(0.094)).toBe("$0.094")
    expect(formatUsd(0)).toBe("$0.00")
  })
  it("quotes the current duration and resolution without submitting a paid job", async () => {
    expect(await estimateUserGeneration("owner", input)).toMatchObject({
      status: "ready",
      usd: 1.56,
    })
    await estimateUserGeneration("owner", {
      ...input,
      settings: { resolution: "1080p", duration: 10 },
    })
    expect(mocks.estimate.mock.calls[1]).toEqual([
      "test/video",
      { resolution: "1080p", duration: 10, prompt: "A test" },
    ])
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("never turns variable pricing into a guessed price", async () => {
    mocks.estimate.mockRejectedValue(new EstimateDescriptionError("metered"))
    expect(await estimateUserGeneration("owner", input)).toMatchObject({
      status: "variable",
      usd: null,
    })
    await expect(
      submitUserGeneration("owner", { ...input, expectedUsd: 1.56 })
    ).rejects.toMatchObject({ code: "PRICE_UNAVAILABLE" })
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it("blocks stale or missing prices before storing or submitting the job", async () => {
    for (const expectedUsd of [undefined, 1.55, 1.57]) {
      await expect(
        submitUserGeneration("owner", { ...input, expectedUsd })
      ).rejects.toMatchObject({ code: "PRICE_CHANGED" })
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it("submits only when the fresh provider price matches the displayed price", async () => {
    await submitUserGeneration("owner", { ...input, expectedUsd: 1.56 })
    expect(mocks.submit).toHaveBeenCalledOnce()
    expect(mocks.rpc.mock.calls[0][1].job.provider_cost_estimate).toBe(1.56)
  })
  it("rejects another user's media before asking the provider for a quote", async () => {
    await expect(
      estimateUserGeneration("owner", {
        ...input,
        media: [{ role: "start", url: "https://example.com/other/image.png" }],
      })
    ).rejects.toThrow("Not owned")
    expect(mocks.estimate).not.toHaveBeenCalled()
  })
  it("shows safe credential errors rather than provider payloads", async () => {
    mocks.estimate.mockRejectedValue(
      new PlatformError(401, { detail: "private-provider-data" })
    )
    await expect(estimateUserGeneration("owner", input)).rejects.toThrow(
      "Reconnect a valid API key"
    )
  })
  for (const usd of [null, "", -1, "bad"]) {
    it(`rejects invalid provider money value ${JSON.stringify(usd)}`, async () => {
      const client = createHiggsfieldClient({
        credentials: "test-key",
        baseUrl: "https://example.com",
        fetch: async () =>
          new Response(JSON.stringify({ type: "numeric", usd }), {
            status: 200,
          }),
      })
      await expect(client.estimate("test/video", {})).rejects.toThrow()
    })
  }
})
