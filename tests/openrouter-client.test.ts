import { describe, expect, it, vi } from "vitest"
import {
  createOpenRouterCatalog,
  normalizeOpenRouterModels,
  normalizeOpenRouterEndpoints,
  selectOpenRouterEndpoint,
} from "@/lib/openrouter/catalog"
import {
  createOpenRouterClient,
  AmbiguousOpenRouterError,
  OpenRouterError,
  decodeOpenRouterResult,
} from "@/lib/openrouter/client"
import { validateOpenRouterInput } from "@/lib/openrouter/schema"
import fixture from "@/lib/openrouter/catalog.snapshot.json"
import calculatorFixtures from "@/lib/openrouter/pricing-calculator.fixtures.json"
import {
  estimateGptImageOutputTokens,
  estimateKnownImageCost,
} from "@/lib/openrouter/pricing-calculator"

const path = "openai/gpt-image-2.5-flare"
const model = {
  ...normalizeOpenRouterModels(fixture.models, 1000).find(
    (row) => row.path === path
  )!,
  endpoints: normalizeOpenRouterEndpoints(fixture.endpoints[path], path),
}
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const response = {
  data: [{ b64_json: png.toString("base64"), media_type: "image/png" }],
  usage: { cost: 0.043725 },
}
function catalogFetch(url: string | URL | Request) {
  const value = String(url)
  return Promise.resolve(
    new Response(
      JSON.stringify(
        value.endsWith("/endpoints") ? fixture.endpoints[path] : fixture.models
      )
    )
  )
}

describe("OpenRouter public image discovery", () => {
  it("uses real GPT Image 2.5 and Nano Banana model IDs without guessed aliases", () => {
    const models = normalizeOpenRouterModels(fixture.models, 1000)
    expect(models.some((m) => m.path === "openai/gpt-image-2.5-flare")).toBe(
      true
    )
    expect(models.some((m) => m.path === "openai/gpt-image-2.5-sunburst")).toBe(
      true
    )
    expect(models.some((m) => m.path === "google/gemini-3.1-flash-image")).toBe(
      true
    )
    expect(
      models.every((m) => m.surface === "image" && m.id.startsWith("or:"))
    ).toBe(true)
  })
  it("refreshes public schemas and preserves a stale snapshot on outage", async () => {
    const catalog = createOpenRouterCatalog({
      fetcher: catalogFetch,
      now: () => 1000,
    })
    expect((await catalog.listOpenRouterModels()).stale).toBe(false)
    const definition = await catalog.getOpenRouterModel(`or:${path}`)
    expect(definition?.endpoints[0]?.pricing[2]?.unit).toBe("token")
    expect(definition?.stale).toBe(false)
    expect(
      await catalog.getOpenRouterModel("https://attacker.test/schema")
    ).toBeNull()
    const offline = createOpenRouterCatalog({
      fetcher: async () => {
        throw new Error("offline")
      },
      now: () => 1000,
    })
    expect((await offline.listOpenRouterModels()).stale).toBe(true)
    expect((await offline.getOpenRouterModel(path))?.stale).toBe(true)
  })
  it("never invents an upfront total for token-metered GPT Image 2.5", async () => {
    const catalog = createOpenRouterCatalog({
      fetcher: catalogFetch,
      now: () => 1000,
    })
    const quote = await catalog.quoteOpenRouterInput(`or:${path}`, {
      prompt: "A forest",
    })
    expect(quote.usd).toBeNull()
    expect(quote.providerTag).toBe("openai")
    expect(quote.pricing).toMatchObject([
      { billable: "input_image", unit: "token", cost_usd: 0.000008 },
      { billable: "input_text", unit: "token", cost_usd: 0.000005 },
      { billable: "output_image", unit: "token", cost_usd: 0.00003 },
    ])
  })

  it("rejects malformed metadata, arbitrary endpoint URLs and unsafe prices", () => {
    expect(() =>
      normalizeOpenRouterModels(
        {
          data: [
            { ...fixture.models.data[0], endpoints: "https://attacker.test/" },
          ],
        },
        1000
      )
    ).toThrow()
    expect(() =>
      normalizeOpenRouterEndpoints(
        {
          id: path,
          endpoints: [
            {
              ...fixture.endpoints[path].endpoints[0],
              pricing: [
                { billable: "output_image", unit: "token", cost_usd: -1 },
              ],
            },
          ],
        },
        path
      )
    ).toThrow()
    expect(() => normalizeOpenRouterModels({ data: [] }, 1000)).toThrow()
  })
  it("validates endpoint capabilities, count bounds, references and extra routing fields", () => {
    expect(
      validateOpenRouterInput(model.inputSchema, {
        prompt: "A forest",
        quality: "max",
      }).errors
    ).toEqual([])
    for (const bad of [
      { prompt: "A forest", n: 11 },
      { prompt: "A forest", quality: "invented" },
      { prompt: "A forest", provider: { only: ["attacker"] } },
      { prompt: "A forest", model: "other/model" },
      {
        prompt: "A forest",
        input_references: [
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,AAAA" },
          },
        ],
      },
    ])
      expect(validateOpenRouterInput(model.inputSchema, bad).data).toBeNull()
    expect(() =>
      selectOpenRouterEndpoint(
        { ...model, stale: true },
        { prompt: "A forest" }
      )
    ).toThrow("unavailable")
  })
})

describe("OpenRouter image transport", () => {
  it("pins the verified provider, uses bearer auth, decodes bounded raster bytes and actual cost", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        headers: { "x-request-id": "provider-request" },
      })
    )
    const client = createOpenRouterClient({
      apiKey: "opaque-test-token",
      fetch: fetcher,
      getModel: async () => model,
    })
    const result = await client.generateImage(model.id, {
      prompt: "A forest",
      quality: "high",
    })
    expect(result).toMatchObject({
      requestId: "provider-request",
      actualCostUsd: 0.043725,
      images: [{ contentType: "image/png" }],
    })
    expect(result.images[0]?.bytes).toEqual(png)
    const [url, options] = fetcher.mock.calls[0]!
    expect(url).toBe("https://openrouter.ai/api/v1/images")
    expect(options.headers.Authorization).toBe("Bearer opaque-test-token")
    expect(JSON.parse(options.body)).toMatchObject({
      model: path,
      stream: false,
      provider: { only: ["openai"], allow_fallbacks: false },
    })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it.each([401, 402, 403, 429])(
    "classifies HTTP %s as a rejected request and never retries",
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response("private provider error", { status }))
      const client = createOpenRouterClient({
        apiKey: "opaque-test-token",
        fetch: fetcher,
        getModel: async () => model,
      })
      await expect(
        client.generateImage(model.id, { prompt: "A forest" })
      ).rejects.toBeInstanceOf(OpenRouterError)
      expect(fetcher).toHaveBeenCalledOnce()
    }
  )
  it.each([500, 502, 504])(
    "treats HTTP %s as ambiguous without a second paid POST",
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response("upstream failed", { status }))
      const client = createOpenRouterClient({
        apiKey: "opaque-test-token",
        fetch: fetcher,
        getModel: async () => model,
      })
      await expect(
        client.generateImage(model.id, { prompt: "A forest" })
      ).rejects.toBeInstanceOf(AmbiguousOpenRouterError)
      expect(fetcher).toHaveBeenCalledOnce()
    }
  )
  it("treats timeout and malformed success bodies as ambiguous", async () => {
    for (const fetcher of [
      vi.fn().mockRejectedValue(new Error("timeout")),
      vi.fn().mockResolvedValue(new Response("bad JSON")),
    ]) {
      await expect(
        createOpenRouterClient({
          apiKey: "opaque-test-token",
          fetch: fetcher,
          getModel: async () => model,
        }).generateImage(model.id, { prompt: "A forest" })
      ).rejects.toBeInstanceOf(AmbiguousOpenRouterError)
      expect(fetcher).toHaveBeenCalledOnce()
    }
  })
  it("rejects SVG, URL-only outputs, malformed base64 and mismatched content types", () => {
    for (const row of [
      {
        b64_json: Buffer.from("<svg></svg>").toString("base64"),
        media_type: "image/svg+xml",
      },
      { url: "https://attacker.test/image.png" },
      { b64_json: "%%%%" },
      { b64_json: png.toString("base64"), media_type: "image/jpeg" },
    ])
      expect(() => decodeOpenRouterResult({ data: [row] }, null)).toThrow()
    expect(() =>
      decodeOpenRouterResult({ ...response, usage: { cost: -1 } }, null)
    ).toThrow()
    expect(
      decodeOpenRouterResult({ data: response.data }, null).actualCostUsd
    ).toBeNull()
  })
})

describe("verified configuration-based image estimates", () => {
  for (const row of calculatorFixtures.gptOutputTokens) {
    it(`matches the official GPT calculator: ${row.path} ${row.quality} ${row.width}x${row.height}`, () => {
      expect(
        estimateGptImageOutputTokens(
          row.path,
          row.quality,
          row.width,
          row.height
        )
      ).toBe(row.tokens)
    })
  }
  it("rejects unsupported GPT quality, guessed dimensions and invalid size limits", () => {
    for (const [quality, width, height] of [
      ["auto", 1024, 1024],
      ["low", 1025, 1024],
      ["low", 512, 512],
      ["low", 4096, 4096],
      ["low", 3840, 256],
    ] as const)
      expect(
        estimateGptImageOutputTokens(path, quality, width, height)
      ).toBeNull()
    expect(
      estimateGptImageOutputTokens("other/model", "low", 1024, 1024)
    ).toBeNull()
  })
  for (const row of calculatorFixtures.nanoOutputTokens) {
    it(`uses Google's published image tokens for ${row.path} ${row.resolution}`, () => {
      const estimate = estimateKnownImageCost(
        row.path,
        { prompt: "A forest", resolution: row.resolution, n: 1 },
        [{ billable: "output_image", unit: "token", cost_usd: 0.00003 }]
      )
      expect(estimate?.outputTokens).toBe(row.tokens)
      expect(estimate?.usd).toBeCloseTo(row.tokens * 0.00003, 9)
      expect(estimate?.inputCostComplete).toBe(true)
    })
  }
  it("quotes Nano Banana with explicit defaults and the pinned current provider rate", async () => {
    const nanoPath = "google/gemini-3.1-flash-image"
    const catalog = createOpenRouterCatalog({
      fetcher: async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("/endpoints")
              ? fixture.endpoints[nanoPath]
              : fixture.models
          )
        ),
      now: () => 1000,
    })
    const selected = await catalog.getOpenRouterModel(`or:${nanoPath}`)
    expect(selected?.defaults).toMatchObject({
      resolution: "1K",
      aspect_ratio: "1:1",
    })
    const quote = await catalog.quoteOpenRouterInput(nanoPath, {
      prompt: "A forest",
    })
    expect(quote).toMatchObject({
      usd: 0.07392,
      outputTokens: 1120,
      inputCostComplete: true,
      providerTag: "google-vertex/us",
      estimated: true,
    })
  })
  it("includes the verified Nano Banana Pro input-image tokens", () => {
    const estimate = estimateKnownImageCost(
      "google/gemini-3-pro-image",
      { resolution: "1K", n: 1, input_references: [{}, {}] },
      [
        { billable: "input_image", unit: "token", cost_usd: 0.000002 },
        { billable: "output_image", unit: "token", cost_usd: 0.00012 },
      ]
    )
    expect(estimate).toMatchObject({
      usd: 0.13664,
      outputTokens: 1120,
      inputCostComplete: true,
    })
  })
  it("never calls an output-only estimate a full GPT quote", () => {
    const exactOutput = estimateKnownImageCost(
      path,
      { quality: "low", size: "1024x1024", n: 1 },
      model.endpoints[0]!.pricing
    )
    expect(exactOutput?.outputUsd).toBeCloseTo(0.00588, 9)
    expect(exactOutput?.usd).toBeNull()
    expect(exactOutput?.inputCostComplete).toBe(false)
    const range = estimateKnownImageCost(
      path,
      { quality: "low", aspect_ratio: "1:1", n: 1 },
      model.endpoints[0]!.pricing
    )
    expect(range?.usd).toBeNull()
    expect(range?.outputUsdRange?.min).toBeLessThanOrEqual(0.00588)
    expect(range?.outputUsdRange?.max).toBeGreaterThanOrEqual(0.00588)
    expect(range?.explanation).toContain("not a total quote")
  })
  it("fails closed when a new billable pricing component appears", () => {
    const estimate = estimateKnownImageCost(
      "google/gemini-3.1-flash-image",
      { resolution: "1K" },
      [
        { billable: "output_image", unit: "token", cost_usd: 0.00006 },
        { billable: "input_text", unit: "token", cost_usd: 0.000005 },
      ]
    )
    expect(estimate?.usd).toBeNull()
    expect(estimate?.outputUsd).toBeCloseTo(0.0672, 9)
    expect(estimate?.inputCostComplete).toBe(false)
  })
})
