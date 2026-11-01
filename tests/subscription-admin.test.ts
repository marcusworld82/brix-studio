import { beforeEach, describe, expect, it, vi } from "vitest"
const mock = vi.hoisted(() => ({
  admin: vi.fn(),
  settings: vi.fn(),
  ready: vi.fn(),
  reviews: vi.fn(),
  save: vi.fn(),
  hf: vi.fn(),
  or: vi.fn(),
  model: vi.fn(),
}))
vi.mock("@/lib/auth/session", () => ({ requireAdmin: mock.admin }))
vi.mock("@/lib/action-result", () => ({
  runAction: async (fn: () => Promise<unknown>) => {
    try {
      return { ok: true, data: await fn() }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed",
      }
    }
  },
}))
vi.mock("@/lib/supabase/subscription-billing", () => ({
  subscriptionPricingSettings: mock.settings,
  manualModelPricingReady: mock.ready,
  subscriptionBillingReviews: mock.reviews,
  saveSubscriptionPricingSettings: mock.save,
}))
vi.mock("@/lib/higgsfield/live-catalog", () => ({ listLiveModels: mock.hf }))
vi.mock("@/lib/openrouter/catalog", () => ({
  listOpenRouterModels: mock.or,
  getOpenRouterModel: mock.model,
}))
import {
  getSubscriptionPricingAction,
  saveManualModelPricesAction,
} from "@/app/actions/subscription-admin"
const version = "11111111-1111-4111-8111-111111111111"
const settings = {
  version,
  creditUsd: 0.01,
  markupPercent: 30,
  modelMarkups: { legacy: 40 },
  fixedCredits: {},
  rateUnits: {},
}
beforeEach(() => {
  vi.clearAllMocks()
  mock.admin.mockResolvedValue({ id: version, role: "admin" })
  mock.settings.mockResolvedValue(settings)
  mock.ready.mockResolvedValue(true)
  mock.reviews.mockResolvedValue([])
  mock.hf.mockResolvedValue({
    stale: false,
    models: [
      {
        id: "hf:test",
        path: "test",
        family: "test",
        label: "Current live model",
        surface: "video",
        description: "",
      },
    ],
  })
  mock.or.mockResolvedValue({ models: [] })
  mock.save.mockImplementation(async (value) => ({ ...value, version }))
})
describe("manual API pricing admin", () => {
  it("renders live models with a setup warning when subscription migrations are absent", async () => {
    mock.settings.mockRejectedValue(new Error("Missing RPC"))
    mock.ready.mockResolvedValue(false)
    mock.reviews.mockRejectedValue(new Error("Missing table"))
    const result = await getSubscriptionPricingAction()
    expect(result).toMatchObject({
      ok: true,
      data: { pricingReady: false, version: null, models: [{ id: "hf:test" }] },
    })
    if (result.ok)
      expect(result.data.setupMessage).toContain("saving is disabled")
  })
  it("does not add historical static models without a saved override", async () => {
    const result = await getSubscriptionPricingAction()
    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.data.models.map((model) => model.id)).toEqual([
        "hf:test",
        "legacy",
      ])
      expect(
        result.data.models.find((model) => model.id === "legacy")
      ).toMatchObject({ legacy: true, surface: "unavailable" })
    }
  })
  it("blocks saving before setup instead of pretending a price was saved", async () => {
    mock.ready.mockResolvedValue(false)
    const result = await saveManualModelPricesAction({
      version,
      prices: { "hf:test": { usd: 0.15, unit: "second" } },
    })
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("setup is pending"),
    })
    expect(mock.save).not.toHaveBeenCalled()
  })
  it("saves manual dollars as credit-aligned rates with optimistic version locking", async () => {
    await saveManualModelPricesAction({
      version,
      prices: { "hf:test": { usd: 0.15, unit: "second" } },
    })
    expect(mock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fixedCredits: { "hf:test": 15 },
        rateUnits: { "hf:test": "second" },
        expectedVersion: version,
        modelMarkups: { legacy: 40 },
      })
    )
    mock.save.mockClear()
    expect(
      await saveManualModelPricesAction({
        version,
        prices: { "hf:test": { usd: 0.015, unit: "second" } },
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining("multiples") })
    expect(mock.save).not.toHaveBeenCalled()
  })
  it("checks admin access before reading catalogs or prices", async () => {
    mock.admin.mockRejectedValue(new Error("Not found"))
    expect(await getSubscriptionPricingAction()).toMatchObject({
      ok: false,
      error: "Not found",
    })
    expect(mock.hf).not.toHaveBeenCalled()
    expect(mock.settings).not.toHaveBeenCalled()
  })
})
