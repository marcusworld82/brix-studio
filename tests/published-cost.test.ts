import { describe, it, expect } from "vitest"
import {
  publishedCost,
  publishedFormulaSupported,
} from "@/lib/higgsfield/published-cost"
const pricing = {
  primary: {
    amount: "0.3405",
    original_amount: "0.681",
    currency: "USD",
    unit: "second",
  },
  options: [
    {
      amount: "0.3405",
      original_amount: "0.681",
      currency: "USD",
      unit: "second",
      configuration: { resolution: "720p" },
    },
  ],
}
describe("Published formula estimates", () => {
  const restylePath = "higgsfield/genjutsu/restyle/v1.0"
  const restyleRates =
    "Roughly costs $0.318 per second at 480p, $0.681 per second at 720p, or $1.632 per second at 1080p."
  it.each([
    ["480p", 2.862],
    ["720p", 6.129],
    ["1080p", 14.688],
  ])(
    "quotes Restyle at %s from current provider rates and rounded source duration",
    (resolution, usd) => {
      expect(
        publishedCost(restylePath, { resolution }, null, restyleRates, [
          { kind: "video", role: "source", durationSec: 8.1 },
        ])
      ).toMatchObject({ usd, estimated: true, source: "published" })
    }
  )
  it("uses updated Restyle rates and its documented 30 second trim", () => {
    expect(
      publishedCost(
        restylePath,
        { resolution: "720p", duration: 1 },
        null,
        restyleRates.replace("$0.681", "$0.7"),
        [{ kind: "video", role: "source", durationSec: 35.1 }]
      )
    ).toMatchObject({ usd: 21, estimated: true })
  })
  it("refuses Restyle quotes with unknown rates or unverified source duration", () => {
    for (const seconds of [undefined, 0, 3.9, Infinity])
      expect(
        publishedCost(restylePath, { resolution: "720p" }, null, restyleRates, [
          { kind: "video", role: "source", durationSec: seconds },
        ])
      ).toBeNull()
    expect(
      publishedCost(
        restylePath,
        { resolution: "720p" },
        null,
        "Pricing unavailable",
        [{ kind: "video", role: "source", durationSec: 8 }]
      )
    ).toBeNull()
    expect(
      publishedCost(
        restylePath,
        { resolution: "720p" },
        null,
        restyleRates + " An extra input fee also applies.",
        [{ kind: "video", role: "source", durationSec: 8 }]
      )
    ).toBeNull()
    expect(
      publishedCost(restylePath, { resolution: "720p" }, null, restyleRates, [
        { kind: "video", role: "source", durationSec: 8 },
        { kind: "video", role: "video", durationSec: 2 },
      ])
    ).toBeNull()
  })
  const lightDescription =
    "Priced per total second by resolution: 480p $0.05, 720p $0.10, or 1080p $0.20. Rates shown are before any applicable customer discount. Billable seconds = output duration + the sum of input reference video durations. Input video durations are measured during preprocessing; without video references, only output duration is billed. Genjutsu Light trims the source to 15 seconds; output duration is rounded up to whole seconds before billing."
  const lightPricing = {
    primary: {
      amount: "0.025",
      original_amount: "0.05",
      currency: "USD",
      unit: "second",
    },
    options: [
      {
        amount: "0.025",
        original_amount: "0.05",
        currency: "USD",
        unit: "second",
        configuration: { resolution: "480p" },
      },
      {
        amount: "0.05",
        original_amount: "0.1",
        currency: "USD",
        unit: "second",
        configuration: { resolution: "720p" },
      },
      {
        amount: "0.1",
        original_amount: "0.2",
        currency: "USD",
        unit: "second",
        configuration: { resolution: "1080p" },
      },
    ],
  }
  it.each(["motion-transfer", "object-swap"])(
    "supports verified Light %s pricing at every resolution",
    (operation) => {
      const path = `higgsfield/genjutsu-light/${operation}/v1.0`
      expect(publishedFormulaSupported(path)).toBe(true)
      for (const [resolution, expected] of [
        ["480p", 0.25],
        ["720p", 0.5],
        ["1080p", 1],
      ] as const) {
        expect(
          publishedCost(
            path,
            { resolution, duration: 1 },
            lightPricing,
            lightDescription,
            [{ kind: "video", role: "source", durationSec: 4.1 }]
          )
        ).toMatchObject({ usd: expected, estimated: true })
      }
    }
  )
  it("caps Light at the documented 15 second trimmed source", () => {
    expect(
      publishedCost(
        "higgsfield/genjutsu-light/motion-transfer/v1.0",
        { resolution: "720p" },
        lightPricing,
        lightDescription,
        [{ kind: "video", role: "source", durationSec: 35.2 }]
      )
    ).toMatchObject({ usd: 1.5 })
  })
  it("fails closed for unknown Light billing, reference videos, missing source metadata or rates", () => {
    const path = "higgsfield/genjutsu-light/motion-transfer/v1.0"
    const source = { kind: "video", role: "source", durationSec: 4.1 }
    expect(
      publishedCost(
        path,
        { resolution: "720p", duration: 1 },
        lightPricing,
        lightDescription,
        []
      )
    ).toBeNull()
    expect(
      publishedCost(
        path,
        { resolution: "720p" },
        lightPricing,
        lightDescription,
        [source, { kind: "video", role: "reference", durationSec: 2 }]
      )
    ).toBeNull()
    expect(
      publishedCost(path, { resolution: "720p" }, lightPricing, "unknown", [
        source,
      ])
    ).toBeNull()
    expect(
      publishedCost(
        path,
        { resolution: "4k" },
        lightPricing,
        lightDescription,
        [source]
      )
    ).toBeNull()
    expect(
      publishedCost(path, { resolution: "720p" }, null, lightDescription, [
        source,
      ])
    ).toBeNull()
    expect(publishedFormulaSupported("higgsfield/genjutsu-light/new/v2")).toBe(
      false
    )
  })
  it("uses list rate and rounded real source duration, not an unverified maximum discount", () => {
    expect(
      publishedCost(
        "higgsfield/genjutsu/motion-transfer/v1.0",
        { resolution: "720p" },
        pricing,
        "",
        [{ kind: "video", role: "source", durationSec: 4.1 }]
      )
    ).toMatchObject({ usd: 3.405, estimated: true })
  })
  it("refuses source-length pricing without trusted video duration", () => {
    expect(
      publishedCost(
        "higgsfield/genjutsu/motion-transfer/v1.0",
        { resolution: "720p" },
        pricing,
        "",
        []
      )
    ).toBeNull()
  })
  it("reads the current provider approximate per-second formula instead of a hardcoded price", () => {
    const description =
      "For 16:9 video without video input, your request costs roughly $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372 at 1080p. Each 1,000 video tokens costs $0.0214 at 480p or 720p. Rates shown are before any applicable customer discount."
    expect(
      publishedCost(
        "bytedance/seedance-2.5/text-to-video",
        { resolution: "720p", duration: 5, aspect_ratio: "16:9" },
        null,
        description,
        []
      )
    ).toMatchObject({ usd: 2.311, estimated: true })
    expect(
      publishedCost(
        "bytedance/seedance-2.5/text-to-video",
        { resolution: "720p", duration: 10, aspect_ratio: "16:9" },
        null,
        description.replace("$0.4622", "$0.5"),
        []
      )
    ).toMatchObject({ usd: 5 })
  })
  it("does not extrapolate an unknown aspect ratio or unknown model formula", () => {
    expect(
      publishedCost(
        "new/unknown",
        { resolution: "720p", duration: 5 },
        pricing,
        "",
        []
      )
    ).toBeNull()
    expect(
      publishedCost(
        "bytedance/seedance-2.5/text-to-video",
        { resolution: "720p", duration: 5, aspect_ratio: "1:1" },
        pricing,
        "roughly $0.4622 at 720p",
        []
      )
    ).toBeNull()
  })
})
