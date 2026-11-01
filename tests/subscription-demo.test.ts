import { describe, expect, it } from "vitest"
import {
  defaultDemoState,
  demoUsage,
  parseDemoState,
  quoteDemo,
  restoreDemoState,
  simulatePreview,
} from "@/lib/subscription/demo"

describe("subscription demo pricing", () => {
  it("applies markup and conversion, rounding up once", () => {
    const model = defaultDemoState().models[0]
    expect(quoteDemo(model, 100, 1)).toEqual({
      providerUsd: 0.04,
      draftUsd: 0.05,
      credits: 5,
    })
    expect(quoteDemo({ ...model, baseUsd: 0.041 }, 100, 1).credits).toBe(6)
    expect(quoteDemo({ ...model, baseUsd: 0.12 }, 100, 10).credits).toBe(150)
  })
  it("rejects impossible and unsafe calculation inputs", () => {
    const model = defaultDemoState().models[0]
    for (const rate of [0, -1, Infinity, NaN, 10001])
      expect(() => quoteDemo(model, rate, 1)).toThrow()
    for (const units of [0, -1, 1.5, 41, NaN])
      expect(() => quoteDemo(model, 100, units)).toThrow()
    expect(() => quoteDemo({ ...model, markupPercent: -1 }, 100, 1)).toThrow()
  })
})
describe("subscription demo persistence and balances", () => {
  it("falls back safely for corrupt, old, duplicate and invalid stored data", () => {
    for (const serialized of [
      null,
      "{broken",
      "null",
      JSON.stringify({ ...defaultDemoState(), version: 2 }),
      JSON.stringify({ ...defaultDemoState(), selectedPlanId: "unknown" }),
      JSON.stringify({ ...defaultDemoState(), creditsPerUsd: -5 }),
    ])
      expect(restoreDemoState(serialized)).toEqual(defaultDemoState())
    const state = defaultDemoState()
    state.models[1].id = state.models[0].id
    expect(parseDemoState(state)).toBeNull()
  })
  it("restores valid values and computes balance from immutable preview rows", () => {
    const initial = defaultDemoState()
    const next = simulatePreview(
      initial,
      { modelId: "image-fast", prompt: " A test scene ", units: 4 },
      "preview-1",
      "2026-11-01T00:00:00.000Z"
    )
    expect(initial.history).toHaveLength(0)
    expect(next.history[0].prompt).toBe("A test scene")
    expect(demoUsage(next)).toEqual({
      allocation: 2400,
      used: 20,
      remaining: 2380,
    })
    expect(restoreDemoState(JSON.stringify(next))).toEqual(next)
  })
  it("blocks overdrafts, empty prompts and duplicate preview IDs", () => {
    const state = defaultDemoState()
    state.plans[1].monthlyCredits = 1
    expect(() =>
      simulatePreview(
        state,
        { modelId: "image-fast", prompt: "Scene", units: 1 },
        "p1",
        "2026-11-01T00:00:00.000Z"
      )
    ).toThrow("Not enough demo credits")
    expect(() =>
      simulatePreview(
        defaultDemoState(),
        { modelId: "image-fast", prompt: " ", units: 1 },
        "p1",
        "2026-11-01T00:00:00.000Z"
      )
    ).toThrow()
    const next = simulatePreview(
      defaultDemoState(),
      { modelId: "image-fast", prompt: "Scene", units: 1 },
      "p1",
      "2026-11-01T00:00:00.000Z"
    )
    expect(() =>
      simulatePreview(
        next,
        { modelId: "image-fast", prompt: "Scene", units: 1 },
        "p1",
        "2026-11-01T00:00:00.000Z"
      )
    ).toThrow("Invalid preview")
  })
  it("preserves past usage when switching plans or future prices", () => {
    const next = simulatePreview(
      defaultDemoState(),
      { modelId: "image-fast", prompt: "Scene", units: 1 },
      "p1",
      "2026-11-01T00:00:00.000Z"
    )
    next.selectedPlanId = "explore"
    next.models[0].markupPercent = 900
    expect(demoUsage(next)).toEqual({
      allocation: 800,
      used: 5,
      remaining: 795,
    })
  })
})
