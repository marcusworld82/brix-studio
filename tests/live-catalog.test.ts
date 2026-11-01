import { describe, expect, it } from "vitest"
import verifiedSnapshot from "@/lib/higgsfield/catalog.snapshot.json"
import {
  CATALOG_PATH,
  PRICING_PATH,
  createLiveCatalogClient,
  fetchPublicPages,
  normalizeLiveCatalog,
  normalizeLiveDefinition,
} from "@/lib/higgsfield/live-catalog"
import { validateLiveInput } from "@/generation/catalog/live-schema"
import type {
  LiveCatalogSnapshot,
  LiveModelDefinition,
  LiveModelSummary,
} from "@/generation/catalog/live-types"

const model: LiveModelSummary = {
  id: "hf:example/new-model",
  path: "example/new-model",
  label: "New model",
  family: "Example",
  surface: "image",
  description: "A newly published model",
}
const family = {
  catalog_type: "model",
  availability_state: "available",
  title: "Example",
  entry_points: [{ mode_id: model.path, output_type: "image" }],
}
const priceFamily = {
  availability_state: "available",
  title: "Example",
  modes: [
    {
      slug: model.path,
      availability_state: "available",
      output_type: "image",
      title: "New model",
      pricing: {
        primary: {
          amount: "0.02",
          original_amount: "0.04",
          currency: "USD",
          unit: "image",
          discount_percentage: 50,
          discount_expires_at: "2026-12-01T00:00:00Z",
        },
        options: [
          {
            amount: "0.02",
            currency: "USD",
            unit: "image",
            configuration: { resolution: "1k" },
          },
        ],
      },
    },
  ],
}
const rawDetail = {
  slug: model.path,
  input_schema: {
    type: "object",
    required: ["prompt"],
    properties: {
      prompt: { type: "string", minLength: 1 },
      count: { type: "integer", default: 1, minimum: 1, maximum: 4 },
    },
    additionalProperties: false,
  },
  ui_schema: { "ui:order": ["prompt", "count"] },
  playground: { initial_values: { prompt: "Example demo prompt" } },
  pricing_description: "Per generated image.",
}
const page = (
  results: unknown[],
  next: string | null = null,
  count = results.length
) => new Response(JSON.stringify({ results, next, count }), { status: 200 })
const empty: LiveCatalogSnapshot = {
  catalog: { models: [], fetchedAt: 1, stale: false, warnings: [] },
  definitions: {},
}
const snapshot: LiveCatalogSnapshot = {
  catalog: { models: [model], fetchedAt: 100, stale: false, warnings: [] },
  definitions: { [model.id]: normalizeLiveDefinition(model, rawDetail, 100) },
}
const definition = (schema: Record<string, unknown>): LiveModelDefinition => ({
  ...normalizeLiveDefinition(model, rawDetail, 100),
  inputSchema: schema,
})

function goodFetch(url: string): Promise<Response> {
  if (url.includes("app-models"))
    return Promise.resolve(new Response(JSON.stringify(rawDetail)))
  return Promise.resolve(
    url.includes(PRICING_PATH) ? page([priceFamily]) : page([family])
  )
}

describe("public live model catalog", () => {
  it("discovers and validates a new compatible model without a source catalog entry", async () => {
    const client = createLiveCatalogClient({
      fetcher: goodFetch,
      snapshot: empty,
      now: () => 1000,
    })
    const result = await client.listLiveModels()
    expect(result.stale).toBe(false)
    expect(result.models).toHaveLength(1)
    expect(result.models[0].id).toBe(model.id)
    const detail = await client.getLiveModel(model.id)
    expect(detail?.defaults).toEqual({ count: 1 })
    expect(detail?.uiSchema).toEqual(rawDetail.ui_schema)
    expect(validateLiveInput(detail!, { prompt: "Sunrise" }).data).toEqual({
      prompt: "Sunrise",
      count: 1,
    })
    expect(detail?.defaults).not.toHaveProperty("prompt")
    expect(await client.getPublishedPricing(model.path)).toMatchObject({
      primary: { original_amount: "0.04", discount_percentage: 50 },
      options: [{ configuration: { resolution: "1k" } }],
    })
  })

  it("rejects unknown IDs and arbitrary upstream paths", async () => {
    const urls: string[] = []
    const client = createLiveCatalogClient({
      fetcher: (url) => {
        urls.push(url)
        return goodFetch(url)
      },
      snapshot: empty,
      now: () => 1000,
    })
    expect(
      await client.getLiveModel("hf:https://attacker.test/steal")
    ).toBeNull()
    expect(await client.getLiveModel(model.path)).toBeNull()
    expect(await client.getPublishedPricing("../api-keys")).toBeNull()
    expect(urls).toHaveLength(2)
  })

  it("falls back to visibly stale verified snapshot during outage", async () => {
    const client = createLiveCatalogClient({
      fetcher: async () => {
        throw new Error("offline")
      },
      snapshot,
      now: () => 1000,
    })
    const result = await client.listLiveModels()
    expect(result.models).toEqual([model])
    expect(result.fetchedAt).toBe(100)
    expect(result.stale).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect((await client.getLiveModel(model.id))?.stale).toBe(true)
    expect(await client.getPublishedPricing(model.path)).toBeNull()
  })

  it("keeps the last successful catalog and timestamp when a later feed is malformed", async () => {
    let time = 1000
    let malformed = false
    const client = createLiveCatalogClient({
      fetcher: (url) =>
        malformed ? Promise.resolve(page([{}])) : goodFetch(url),
      snapshot: empty,
      now: () => time,
    })
    const first = await client.listLiveModels()
    time += 301_000
    malformed = true
    const next = await client.listLiveModels()
    expect(next.models).toEqual(first.models)
    expect(next.fetchedAt).toBe(first.fetchedAt)
    expect(next.stale).toBe(true)
    expect(next.warnings.join(" ")).toContain("unexpectedly")
  })

  it("refreshes prices after one minute without downloading model details or the catalog again", async () => {
    let time = 1000
    const urls: string[] = []
    const client = createLiveCatalogClient({
      fetcher: (url) => {
        urls.push(url)
        return goodFetch(url)
      },
      snapshot: empty,
      now: () => time,
    })
    await client.listLiveModels()
    time += 61_000
    await client.listLiveModels()
    expect(urls.filter((url) => url.includes(CATALOG_PATH))).toHaveLength(1)
    expect(urls.filter((url) => url.includes(PRICING_PATH))).toHaveLength(2)
    expect(urls.some((url) => url.includes("app-models"))).toBe(false)
  })

  it("reads trusted pagination and refuses foreign hosts, paths, loops and invalid shapes", async () => {
    const rows = await fetchPublicPages(
      async (url) =>
        url.includes("page=2")
          ? page([2], null, 2)
          : page([1], `${CATALOG_PATH}?page=2`, 2),
      CATALOG_PATH
    )
    expect(rows).toEqual([1, 2])
    for (const next of [
      "https://attacker.test/api/v2/catalog-models/",
      "https://dash.higgsfield.ai/api/v1/api-keys/",
      `${CATALOG_PATH}?page=1&page_size=50`,
    ]) {
      await expect(
        fetchPublicPages(async () => page([1], next), CATALOG_PATH)
      ).rejects.toThrow("Unsafe")
    }
    await expect(
      fetchPublicPages(
        async () =>
          new Response(JSON.stringify({ results: {}, count: 1, next: null })),
        CATALOG_PATH
      )
    ).rejects.toThrow("Invalid")
    await expect(
      fetchPublicPages(async () => page([1], null, 0), CATALOG_PATH)
    ).rejects.toThrow("result count")
    await expect(
      fetchPublicPages(
        async () => new Response("upstream down", { status: 503 }),
        CATALOG_PATH
      )
    ).rejects.toThrow("503")
  })

  it("bounds pagination rather than following an endless provider feed", async () => {
    let pageNumber = 0
    await expect(
      fetchPublicPages(
        async () => page([1], `${CATALOG_PATH}?page=${++pageNumber + 1}`),
        CATALOG_PATH
      )
    ).rejects.toThrow("pagination limit")
  })

  it("does not expose malformed original prices as valid list-price metadata", () => {
    for (const original_amount of ["", "bad", "-1", "Infinity", -1, {}]) {
      const broken = structuredClone(priceFamily)
      const unsafe: unknown = {
        ...broken.modes[0].pricing.primary,
        original_amount,
      }
      const rows = [
        {
          ...broken,
          modes: [
            {
              ...broken.modes[0],
              pricing: { ...broken.modes[0].pricing, primary: unsafe },
            },
          ],
        },
      ]
      expect(normalizeLiveCatalog([family], rows)[0].pricing).toBeUndefined()
    }
  })

  it("excludes unavailable, workflow and unsupported output models", () => {
    const result = normalizeLiveCatalog(
      [
        family,
        {
          ...family,
          availability_state: "disabled",
          entry_points: [{ mode_id: "other/disabled", output_type: "video" }],
        },
        { ...family, catalog_type: "workflow" },
      ],
      [
        priceFamily,
        {
          ...priceFamily,
          modes: [
            {
              slug: "other/model",
              availability_state: "available",
              output_type: "3d",
            },
          ],
        },
      ]
    )
    expect(result).toHaveLength(1)
  })

  it("refuses schemas for a different model and strips unsafe metadata keys", () => {
    expect(() =>
      normalizeLiveDefinition(
        model,
        { ...rawDetail, slug: "other/model" },
        1000
      )
    ).toThrow("Invalid")
    const raw: unknown = JSON.parse(
      JSON.stringify(rawDetail).replace('"ui:order"', '"__proto__"')
    )
    expect(
      normalizeLiveDefinition(model, raw, 1000).uiSchema
    ).not.toHaveProperty("__proto__")
  })
})

describe("live JSON Schema input validation", () => {
  it("applies cloned defaults and rejects bounds, unknown fields and wrong types", () => {
    const detail = normalizeLiveDefinition(model, rawDetail, 100)
    const raw = { prompt: "Hello" }
    expect(validateLiveInput(detail, raw).data).toEqual({
      prompt: "Hello",
      count: 1,
    })
    expect(raw).toEqual({ prompt: "Hello" })
    for (const input of [
      { prompt: "" },
      { prompt: "Hello", count: 8 },
      { prompt: "Hello", count: "2" },
      { prompt: "Hello", endpoint: "other/model" },
    ])
      expect(validateLiveInput(detail, input).data).toBeNull()
  })

  it("preserves nested conditionals and validates media array bounds", () => {
    const detail = definition({
      type: "object",
      if: { required: ["image_urls"] },
      else: {
        if: { required: ["video_urls"] },
        else: { required: ["audio_urls"] },
      },
      properties: {
        image_urls: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          items: { type: "string", format: "uri" },
        },
        video_urls: {
          type: "array",
          minItems: 1,
          items: { type: "string", format: "uri" },
        },
        audio_urls: {
          type: "array",
          minItems: 1,
          items: { type: "string", format: "uri" },
        },
      },
      additionalProperties: false,
    })
    expect(validateLiveInput(detail, {}).data).toBeNull()
    expect(
      validateLiveInput(detail, {
        audio_urls: ["https://example.test/audio.mp3"],
      }).errors
    ).toEqual([])
    expect(validateLiveInput(detail, { image_urls: [] }).data).toBeNull()
    expect(
      validateLiveInput(detail, { image_urls: ["not a URI"] }).data
    ).toBeNull()
    expect(
      validateLiveInput(detail, {
        image_urls: [
          "https://a.test/1",
          "https://a.test/2",
          "https://a.test/3",
        ],
      }).data
    ).toBeNull()
  })

  it("validates a real SOUL prompt despite the provider's incompatible null seed default", () => {
    const soul = verifiedSnapshot.definitions[
      "hf:higgsfield-ai/soul/v2/standard"
    ] as LiveModelDefinition
    const result = validateLiveInput(soul, { prompt: "A quiet forest" })
    expect(result.errors).toEqual([])
    expect(result.data).not.toHaveProperty("seed")
    expect(
      validateLiveInput(soul, { prompt: "A quiet forest", seed: null }).data
    ).toBeNull()
  })

  it("supports local refs and rejects external, unresolved and recursive refs without fetches", () => {
    const local = definition({
      type: "object",
      $defs: { prompt: { type: "string", minLength: 1 } },
      properties: { prompt: { $ref: "#/$defs/prompt" } },
      required: ["prompt"],
    })
    expect(validateLiveInput(local, { prompt: "Hello" }).errors).toEqual([])
    for (const ref of [
      "https://attacker.test/schema.json",
      "other.json",
      "#",
      "#/$defs/missing",
    ]) {
      expect(
        validateLiveInput(
          definition({ type: "object", properties: { prompt: { $ref: ref } } }),
          { prompt: "Hello" }
        ).data
      ).toBeNull()
    }
    expect(
      validateLiveInput(
        definition({ type: "object", $dynamicRef: "#node" }),
        {}
      ).data
    ).toBeNull()
  })
})
