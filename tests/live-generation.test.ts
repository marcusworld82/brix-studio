import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  LiveModelDefinition,
  PublishedPricing,
} from "@/generation/catalog/live-types"
import type { MediaItem } from "@/generation/catalog/types"

const mocks = vi.hoisted(() => ({
  model: vi.fn(),
  prices: vi.fn(),
  info: vi.fn(),
  download: vi.fn(),
  sign: vi.fn(),
}))
vi.mock("@/lib/higgsfield/live-catalog", () => ({
  getLiveModel: mocks.model,
  getPublishedPricing: mocks.prices,
}))
vi.mock("@/lib/env", () => ({
  env: () => ({ APP_URL: "https://studio.example.test" }),
  r2Configured: () => false,
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({
    storage: {
      from: () => ({
        info: mocks.info,
        download: mocks.download,
        createSignedUrl: mocks.sign,
      }),
    },
  }),
}))

import { prepareLiveUserGeneration } from "@/lib/supabase/live-input"
import { quoteGenerationCost } from "@/lib/supabase/generation-cost"
import {
  EstimateDescriptionError,
  PlatformError,
} from "@/lib/higgsfield/client"

const definition: LiveModelDefinition = {
  id: "hf:example/image",
  path: "example/image",
  label: "Example",
  family: "Example",
  surface: "image",
  description: "Test model",
  defaults: {},
  uiSchema: {},
  fetchedAt: 1000,
  stale: false,
  pricingDescription: null,
  inputSchema: {
    type: "object",
    required: ["prompt"],
    properties: {
      prompt: { type: "string" },
      image_url: { type: "string", format: "uri" },
      image_urls: { type: "array", items: { type: "string", format: "uri" } },
      nested: {
        type: "object",
        properties: { asset_url: { type: "string", format: "uri" } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
}
const pricing: PublishedPricing = {
  primary: {
    amount: "0.3405",
    original_amount: "0.681",
    currency: "USD",
    unit: "second",
    discount_percentage: 50,
  },
  options: [
    {
      amount: "0.3405",
      original_amount: "0.681",
      currency: "USD",
      unit: "second",
      discount_percentage: 50,
      configuration: { resolution: "720p" },
    },
  ],
}
const request = {
  path: "higgsfield/genjutsu/motion-transfer/v1.0",
  body: { resolution: "720p" },
}
let sequence = 0
function video(owner = "owner"): MediaItem & { path: string } {
  const path = `${owner}/uploads/clip-${++sequence}.mp4`
  return {
    id: "source",
    kind: "video",
    role: "source",
    path,
    url: `https://storage.example.test/storage/v1/object/sign/brix-media/${path}?token=old`,
  }
}
function input(providerInput: Record<string, unknown>) {
  return {
    modelId: definition.id,
    prompt: "Fallback",
    settings: { providerInput },
  }
}
function mp4(seconds: number): Uint8Array<ArrayBuffer> {
  const buffer = Buffer.alloc(36)
  buffer.writeUInt32BE(36, 0)
  buffer.write("moov", 4)
  buffer.writeUInt32BE(28, 8)
  buffer.write("mvhd", 12)
  buffer.writeUInt32BE(1000, 28)
  buffer.writeUInt32BE(Math.round(seconds * 1000), 32)
  return new Uint8Array(buffer)
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.example.test")
  mocks.model.mockResolvedValue(structuredClone(definition))
  mocks.prices.mockResolvedValue(structuredClone(pricing))
  mocks.info.mockResolvedValue({
    data: { contentType: "image/png", size: 100 },
    error: null,
  })
  mocks.sign.mockImplementation(async (path: string) => ({
    data: {
      signedUrl: `https://storage.example.test/storage/v1/object/sign/brix-media/${path}?token=fresh`,
    },
    error: null,
  }))
  mocks.download.mockResolvedValue({
    data: new Blob([mp4(7.25)], { type: "video/mp4" }),
    error: null,
  })
})
afterAll(() => vi.unstubAllEnvs())

describe("live generation ownership and schema checks", () => {
  it("rejects a Kling shot timeline that disagrees with the priced duration", async () => {
    mocks.model.mockResolvedValueOnce({
      ...definition,
      path: "kling-video/v3.0/std/text-to-video",
      inputSchema: {
        ...definition.inputSchema,
        properties: {
          ...(definition.inputSchema.properties as Record<string, unknown>),
          duration: { type: "integer", minimum: 3, maximum: 15 },
          multi_prompt: { type: "array", items: { type: "object" } },
        },
      },
    })
    await expect(
      prepareLiveUserGeneration(
        "owner",
        input({
          prompt: "Two shots",
          duration: 3,
          multi_prompt: [
            { prompt: "Wide shot", duration: 5 },
            { prompt: "Close-up", duration: 5 },
          ],
        })
      )
    ).rejects.toThrow("shot lengths")
    expect(mocks.info).not.toHaveBeenCalled()
  })

  it("preserves a Kling shot timeline that matches the priced duration", async () => {
    mocks.model.mockResolvedValueOnce({
      ...definition,
      path: "kling-video/v3.0/pro/image-to-video",
      inputSchema: {
        ...definition.inputSchema,
        properties: {
          ...(definition.inputSchema.properties as Record<string, unknown>),
          duration: { type: "integer", minimum: 3, maximum: 15 },
          multi_prompt: { type: "array", items: { type: "object" } },
        },
      },
    })
    const result = await prepareLiveUserGeneration(
      "owner",
      input({
        prompt: "Two shots",
        duration: 7,
        multi_prompt: [
          { prompt: "Wide shot", duration: 3 },
          { prompt: "Close-up", duration: 4 },
        ],
      })
    )
    expect(result.request.body.duration).toBe(7)
    expect(result.request.body.multi_prompt).toHaveLength(2)
  })

  it("rejects undeclared quantity overrides even when extra API fields are allowed", async () => {
    mocks.model.mockResolvedValueOnce({
      ...definition,
      id: "hf:higgsfield/genjutsu-light/motion-transfer/v1.0",
      path: "higgsfield/genjutsu-light/motion-transfer/v1.0",
      inputSchema: { ...definition.inputSchema, additionalProperties: true },
    })
    await expect(
      prepareLiveUserGeneration(
        "owner",
        input({ prompt: "Transfer motion", duration: 1 })
      )
    ).rejects.toThrow("does not define")
    expect(mocks.info).not.toHaveBeenCalled()
  })

  it("rejects dangling native Kling references before reading private files", async () => {
    mocks.model.mockResolvedValueOnce({
      ...definition,
      id: "hf:kling-video/v4.0/reference-to-video",
      path: "kling-video/v4.0/reference-to-video",
    })
    await expect(
      prepareLiveUserGeneration(
        "owner",
        input({ prompt: "Animate @image_2 with @video_1", image_urls: [] })
      )
    ).rejects.toThrow("reference")
    expect(mocks.info).not.toHaveBeenCalled()
    expect(mocks.sign).not.toHaveBeenCalled()
  })

  it("preserves a valid native Kling mention while renewing its owned reference", async () => {
    mocks.model.mockResolvedValueOnce({
      ...definition,
      id: "hf:kling-video/v4.0/reference-to-video",
      path: "kling-video/v4.0/reference-to-video",
    })
    const result = await prepareLiveUserGeneration(
      "owner",
      input({
        prompt: "Animate @image_1",
        image_urls: [
          "https://studio.example.test/api/media/owner/uploads/image.png",
        ],
      })
    )
    expect(result.request.body.prompt).toBe("Animate @image_1")
    expect(result.request.body.image_urls).toEqual([
      expect.stringContaining("token=fresh"),
    ])
  })

  it("rejects missing and stale schemas before accessing private storage", async () => {
    mocks.model.mockResolvedValueOnce(null)
    await expect(
      prepareLiveUserGeneration("owner", input({ prompt: "A forest" }))
    ).rejects.toThrow("not currently")
    mocks.model.mockResolvedValueOnce({ ...definition, stale: true })
    await expect(
      prepareLiveUserGeneration("owner", input({ prompt: "A forest" }))
    ).rejects.toThrow("schema is unavailable")
    expect(mocks.info).not.toHaveBeenCalled()
    expect(mocks.sign).not.toHaveBeenCalled()
  })

  it("rejects another owner's input files before signing them", async () => {
    const url =
      "https://storage.example.test/storage/v1/object/sign/brix-media/someone-else/uploads/private.png?token=old"
    await expect(
      prepareLiveUserGeneration(
        "owner",
        input({ prompt: "A forest", image_url: url })
      )
    ).rejects.toThrow("Media not found")
    expect(mocks.info).not.toHaveBeenCalled()
    expect(mocks.sign).not.toHaveBeenCalled()
  })

  it.each([
    "https://attacker.test/file.png",
    "HTTPS://attacker.test/file.png",
    "data:image/png;base64,AAAA",
    "file:///etc/passwd",
    "ftp://attacker.test/file.png",
  ])("rejects unowned URI %s", async (url) => {
    await expect(
      prepareLiveUserGeneration(
        "owner",
        input({ prompt: "A forest", image_url: url })
      )
    ).rejects.toThrow("Media not found")
    expect(mocks.info).not.toHaveBeenCalled()
    expect(mocks.sign).not.toHaveBeenCalled()
  })

  it("checks nested arrays and nested object references", async () => {
    await expect(
      prepareLiveUserGeneration(
        "owner",
        input({
          prompt: "A forest",
          image_urls: ["https://attacker.test/file.png"],
        })
      )
    ).rejects.toThrow("Media not found")
    await expect(
      prepareLiveUserGeneration(
        "owner",
        input({
          prompt: "A forest",
          nested: { asset_url: "https://attacker.test/file.png" },
        })
      )
    ).rejects.toThrow("Media not found")
  })

  it("re-signs owned media and uses only the model's server-owned path", async () => {
    const result = await prepareLiveUserGeneration(
      "owner",
      input({
        prompt: "https://example.test/this-is-prompt-text",
        image_url:
          "https://studio.example.test/api/media/owner/uploads/image.png",
      })
    )
    expect(result.request.path).toBe(definition.path)
    expect(result.request.body.image_url).toContain("token=fresh")
    expect(result.request.body.prompt).toBe(
      "https://example.test/this-is-prompt-text"
    )
    expect(result.media).toMatchObject([
      { path: "owner/uploads/image.png", role: "start", kind: "image" },
    ])
    expect(mocks.info).toHaveBeenCalledWith("owner/uploads/image.png")
    expect(mocks.sign).toHaveBeenCalledWith("owner/uploads/image.png", 3600)
  })

  it("rejects client endpoint injection and nonexistent private files", async () => {
    await expect(
      prepareLiveUserGeneration(
        "owner",
        input({ prompt: "A forest", endpoint: "other/model" })
      )
    ).rejects.toThrow("additional properties")
    mocks.info.mockResolvedValueOnce({
      data: null,
      error: { message: "missing" },
    })
    await expect(
      prepareLiveUserGeneration(
        "owner",
        input({
          prompt: "A forest",
          image_url:
            "https://studio.example.test/api/media/owner/uploads/missing.png",
        })
      )
    ).rejects.toThrow("no longer available")
    expect(mocks.sign).not.toHaveBeenCalled()
  })
})

describe("authenticated estimates and trusted formula metadata", () => {
  it.each([401, 403, 429, 500])(
    "never falls back to public pricing after provider HTTP %s",
    async (status) => {
      const error = new PlatformError(status, { detail: "fixture" })
      const client = { estimate: vi.fn().mockRejectedValue(error) }
      await expect(
        quoteGenerationCost("owner", client, request, [video()])
      ).rejects.toBe(error)
      expect(mocks.prices).not.toHaveBeenCalled()
      expect(mocks.info).not.toHaveBeenCalled()
      expect(mocks.download).not.toHaveBeenCalled()
    }
  )

  it("preserves authenticated numeric precision and skips media probes", async () => {
    const client = {
      estimate: vi
        .fn()
        .mockResolvedValue({ usd: 0.003725, discountUsd: 0.001 }),
    }
    expect(
      await quoteGenerationCost("owner", client, request, [video()])
    ).toMatchObject({
      usd: 0.003725,
      discountUsd: 0.001,
      estimated: false,
      source: "provider",
    })
    expect(mocks.prices).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it("uses stored video bytes for source duration, ignoring supplied duration metadata", async () => {
    mocks.info.mockResolvedValue({
      data: { contentType: "video/mp4", size: 36 },
      error: null,
    })
    const source = { ...video(), durationSec: 0.1 }
    const client = {
      estimate: vi
        .fn()
        .mockRejectedValue(
          new EstimateDescriptionError("Metered source video.")
        ),
    }
    expect(
      await quoteGenerationCost("owner", client, request, [source])
    ).toMatchObject({ usd: 5.448, source: "published", estimated: true })
    expect(mocks.download).toHaveBeenCalledWith(source.path)
  })

  it("does not keep supplied duration when the stored media cannot be probed", async () => {
    mocks.info.mockResolvedValue({
      data: { contentType: "video/mp4", size: 4 },
      error: null,
    })
    mocks.download.mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "video/mp4" }),
      error: null,
    })
    const client = {
      estimate: vi
        .fn()
        .mockRejectedValue(
          new EstimateDescriptionError("Metered source video.")
        ),
    }
    expect(
      await quoteGenerationCost("owner", client, request, [
        { ...video(), durationSec: 5 },
      ])
    ).toBeNull()
  })

  it("rejects a different owner's source before downloading bytes", async () => {
    const client = {
      estimate: vi
        .fn()
        .mockRejectedValue(
          new EstimateDescriptionError("Metered source video.")
        ),
    }
    await expect(
      quoteGenerationCost("owner", client, request, [video("other-owner")])
    ).rejects.toThrow("Media not found")
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it("cannot calculate a source formula with no media, stale prices or an oversized file", async () => {
    const client = {
      estimate: vi
        .fn()
        .mockRejectedValue(
          new EstimateDescriptionError("Metered source video.")
        ),
    }
    expect(await quoteGenerationCost("owner", client, request, [])).toBeNull()
    mocks.prices.mockResolvedValueOnce(null)
    expect(
      await quoteGenerationCost("owner", client, request, [video()])
    ).toBeNull()
    mocks.info.mockResolvedValue({
      data: { contentType: "video/mp4", size: 51 * 1024 * 1024 },
      error: null,
    })
    expect(
      await quoteGenerationCost("owner", client, request, [video()])
    ).toBeNull()
    expect(mocks.download).toHaveBeenCalledTimes(1)
  })
})
