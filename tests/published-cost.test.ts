import { describe, it, expect } from "vitest"
import { publishedCost } from "@/lib/higgsfield/published-cost"
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
