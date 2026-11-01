import { describe, expect, it } from "vitest"
import {
  higgsfieldAdminModel,
  openRouterAdminModel,
  pricingComparison,
  type AdminCostOption,
} from "@/lib/billing/admin-model-pricing"
import {
  creditsFromCustomerPrice,
  subscriptionRateQuantity,
  subscriptionRateCredits,
} from "@/lib/billing/subscription-rate"
import type { LiveModelSummary } from "@/generation/catalog/live-types"
import type { OpenRouterModel } from "@/lib/openrouter/types"
const model: LiveModelSummary = {
  id: "hf:test/model",
  path: "test/model",
  label: "Test",
  family: "Test",
  description: "Test",
  surface: "video",
}
const option: AdminCostOption = {
  id: "test",
  label: "1080p / 5s",
  rateUsd: 0.1,
  unit: "second",
  resolution: "1080p",
  images: null,
  seconds: 5,
  fullCost: true,
  note: "Published rate",
  stale: false,
}
describe("honest provider cost and profit previews", () => {
  it("uses original list price, never an advertised maximum discount", () => {
    const priced = {
      ...model,
      pricing: {
        primary: {
          amount: "0.1",
          original_amount: "0.2",
          discount_percentage: 50,
          currency: "USD",
          unit: "second",
          qualifier: "exact",
        },
        options: [],
        max_discount: { amount: "0.01", discount_percentage: 95 },
      },
    }
    const row = higgsfieldAdminModel(priced, false)
    expect(row.costs[0]).toMatchObject({
      rateUsd: 0.2,
      unit: "second",
      fullCost: true,
    })
    expect(row.costs[0]?.note).toContain("eligibility is unverified")
    expect(
      pricingComparison(row.costs[0], 0.4, "second", { images: 1, seconds: 5 })
    ).toMatchObject({
      providerUsd: 1,
      customerUsd: 2,
      profitUsd: 1,
      estimated: true,
    })
  })
  it("does not invent a complete cost from discounted-only, token, or partial rates", () => {
    const priced = {
      ...model,
      pricing: {
        primary: {
          amount: "0.1",
          discount_percentage: 50,
          currency: "USD",
          unit: "second",
        },
        options: [],
      },
    }
    expect(
      pricingComparison(
        higgsfieldAdminModel(priced, false).costs[0],
        1,
        "generation",
        { images: 1, seconds: 5 }
      ).profitUsd
    ).toBeNull()
    expect(
      pricingComparison(
        { ...option, unit: "token", fullCost: false },
        1,
        "generation",
        { images: 1, seconds: 5 }
      ).profitUsd
    ).toBeNull()
  })
  it("compares the same duration and uses selected plan revenue per credit", () => {
    expect(
      pricingComparison(option, 0.2, "second", { images: 1, seconds: 10 }, 1.2)
    ).toMatchObject({ providerUsd: 1, customerUsd: 2, profitUsd: 1.4 })
    expect(
      pricingComparison({ ...option, unit: "generation" }, 1, "generation", {
        images: 1,
        seconds: 10,
      }).profitUsd
    ).toBeNull()
    expect(
      pricingComparison(option, 1, "second", { images: 1, seconds: null })
        .profitUsd
    ).toBeNull()
  })
  it("does not pretend OpenRouter output-token rates include input usage", () => {
    const or = {
      id: "or:test/model",
      path: "test/model",
      label: "Test",
      surface: "image",
      family: "test",
      description: "",
      inputSchema: {},
      defaults: {},
      supportedParameters: {},
      fetchedAt: 1,
      stale: false,
      endpoints: [
        {
          providerName: "Test",
          providerSlug: "test",
          providerTag: null,
          inputSchema: {},
          supportedParameters: {},
          pricing: [
            {
              billable: "output_image_tokens",
              unit: "token",
              cost_usd: 0.0001,
            },
          ],
        },
      ],
    } satisfies OpenRouterModel
    const row = openRouterAdminModel(or)
    expect(row.costs[0]?.fullCost).toBe(false)
    expect(
      pricingComparison(row.costs[0], 0.2, "image", {
        images: 1,
        seconds: null,
      }).profitUsd
    ).toBeNull()
  })
})
describe("manual customer rate quantities", () => {
  it("requires credit-aligned dollars and exact generation quantities", () => {
    expect(creditsFromCustomerPrice(0.29, 0.01)).toBe(29)
    expect(() => creditsFromCustomerPrice(0.015, 0.01)).toThrow(/multiples/)
    expect(subscriptionRateQuantity("image", { batch_size: 4 })).toBe(4)
    expect(subscriptionRateQuantity("image", { n: 3 })).toBe(3)
    expect(subscriptionRateQuantity("second", { duration: "10" })).toBe(10)
    expect(() => subscriptionRateQuantity("second", {})).toThrow(
      /explicit duration/
    )
    expect(() =>
      subscriptionRateQuantity("image", { n: 2, batch_size: 4 })
    ).toThrow(/unclear/)
    expect(subscriptionRateCredits(100, 1.001)).toBe(101)
    expect(subscriptionRateCredits(3, 4.333)).toBe(13)
    expect(() =>
      subscriptionRateQuantity("second", { duration: 1.00000000000001 })
    ).toThrow(/three decimal places/)
    expect(
      subscriptionRateQuantity("generation", { duration: 30, n: 10 })
    ).toBe(1)
  })
})
