import { describe, expect, it } from "vitest"
import snapshot from "@/lib/higgsfield/catalog.snapshot.json"
import { capabilitySchema } from "@/lib/openrouter/schema"
import {
  effectiveLiveSchema,
  liveMediaFields,
  liveNumericConstraints,
  readLiveMediaUrls,
  encodeLiveMediaUrls,
  liveMentionToken,
  remapLiveMentionTokens,
  validateNativeMentions,
  LIVE_REFERENCE_APP_LIMIT,
} from "@/generation/catalog/media-constraints"
import type { LiveModelDefinition } from "@/generation/catalog/live-types"
const definitions = snapshot.definitions as Record<string, LiveModelDefinition>
const model = (path: string) => definitions[`hf:${path}`]!

describe("actual provider media and numeric constraints", () => {
  it("retains the complete HF snapshot and the requested new model families", () => {
    expect(snapshot.catalog.models.length).toBeGreaterThanOrEqual(89)
    expect(Object.keys(definitions)).toHaveLength(
      snapshot.catalog.models.length
    )
    for (const [prefix, minimum] of [
      ["higgsfield/genjutsu/", 2],
      ["higgsfield/genjutsu-light/", 2],
      ["kling-video/v4.0/", 4],
      ["bytedance/seedance-2.5/", 5],
    ] as const)
      expect(
        snapshot.catalog.models.filter((row) => row.path.startsWith(prefix))
          .length
      ).toBeGreaterThanOrEqual(minimum)
  })
  it("labels verified GPT renderers without changing the Higgsfield endpoint identities", () => {
    expect(model("marketing-studio/image/flare")).toMatchObject({
      id: "hf:marketing-studio/image/flare",
      path: "marketing-studio/image/flare",
      label: "GPT Image 2.5 Flare",
    })
    expect(model("marketing-studio/image/sunburst")).toMatchObject({
      id: "hf:marketing-studio/image/sunburst",
      path: "marketing-studio/image/sunburst",
      label: "GPT Image 2.5 Sunburst",
    })
  })
  it("reports Seedance2.5's real per-kind limits and preserves conditional reference requirements", () => {
    const definition = model("bytedance/seedance-2.5/reference-to-video")
    const fields = liveMediaFields(definition)
    expect(fields.find((field) => field.key === "image_urls")).toMatchObject({
      kind: "image",
      array: true,
      minItems: 1,
      maxItems: 30,
      encoding: "url-array",
      mentionSyntax: null,
    })
    expect(fields.find((field) => field.key === "video_urls")?.maxItems).toBe(
      10
    )
    expect(fields.find((field) => field.key === "audio_urls")?.maxItems).toBe(
      10
    )
    expect(fields.find((field) => field.key === "audio_urls")?.required).toBe(
      true
    )
    expect(
      liveMediaFields(definition, {
        image_urls: ["https://example.test/1.png"],
      }).find((field) => field.key === "audio_urls")?.required
    ).toBe(false)
    expect(
      liveNumericConstraints(definition).find(
        (field) => field.key === "duration"
      )
    ).toMatchObject({ minimum: 4, maximum: 30, type: "integer" })
  })
  it("applies GPT Image2.5's direct16 and enhanced1-to2 reference limits without changing the original schema", () => {
    const definition = model("marketing-studio/image/flare")
    const original = structuredClone(definition)
    expect(
      liveMediaFields(definition).find((field) => field.key === "image_urls")
    ).toMatchObject({ maxItems: 16, minItems: 0, required: false })
    expect(
      liveMediaFields(definition, { enhance_prompt: true }).find(
        (field) => field.key === "image_urls"
      )
    ).toMatchObject({ maxItems: 2, minItems: 1, required: true })
    expect(definition).toEqual(original)
  })
  it("exposes Genjutsu source and image inputs, without inventing an output duration control", () => {
    for (const prefix of ["genjutsu", "genjutsu-light"]) {
      const definition = model(`higgsfield/${prefix}/motion-transfer/v1.0`)
      expect(
        liveMediaFields(definition).find((field) => field.key === "video_url")
      ).toMatchObject({
        kind: "video",
        array: false,
        minItems: 1,
        maxItems: 1,
        required: true,
      })
      expect(
        liveMediaFields(definition).find((field) => field.key === "image_urls")
      ).toMatchObject({
        kind: "image",
        minItems: 1,
        maxItems: 8,
        required: true,
      })
      expect(
        liveNumericConstraints(definition).some(
          (field) => field.key === "duration"
        )
      ).toBe(false)
    }
  })
  it("distinguishes Kling4 references from element IDs and keeps its3-to30-second range", () => {
    const definition = model("kling-video/v4.0/reference-to-video")
    const fields = liveMediaFields(definition)
    expect(fields.find((field) => field.key === "image_urls")?.maxItems).toBe(
      10
    )
    expect(fields.find((field) => field.key === "video_urls")?.maxItems).toBe(5)
    expect(fields.some((field) => field.key === "elements")).toBe(false)
    expect(
      liveNumericConstraints(definition).find(
        (field) => field.key === "duration"
      )
    ).toMatchObject({ minimum: 3, maximum: 30 })
  })
  it("does not mistake web pages or documents for image references", () => {
    const fields = liveMediaFields(model("alibaba/wan-3.0/reference-to-video"))
    expect(
      fields.some((field) => ["file_url", "link_url"].includes(field.key))
    ).toBe(false)
    expect(
      fields.find((field) => field.key === "video_urls")?.description
    ).toContain("30s total")
  })
  it("keeps an unspecified provider maximum null and labels the app safety cap separately", () => {
    const definition = {
      inputSchema: {
        type: "object",
        properties: {
          image_urls: {
            type: "array",
            items: { type: "string", format: "uri" },
          },
        },
      },
      uiSchema: {},
      defaults: {},
    }
    expect(liveMediaFields(definition)[0]?.maxItems).toBeNull()
    expect(LIVE_REFERENCE_APP_LIMIT).toBe(60)
  })
  it("round-trips URL arrays, scalar frames and OpenRouter reference objects", () => {
    const urls = ["https://example.test/a.png", "https://example.test/b.png"]
    const imageField = liveMediaFields(
      model("marketing-studio/image/flare")
    )[0]!
    expect(
      readLiveMediaUrls(imageField, encodeLiveMediaUrls(imageField, urls))
    ).toEqual(urls)
    const scalar = liveMediaFields(
      model("bytedance/seedance-2.5/image-to-video")
    ).find((field) => field.key === "image_url")!
    expect(
      readLiveMediaUrls(scalar, encodeLiveMediaUrls(scalar, urls))
    ).toEqual([urls[0]])
    const orDefinition = {
      inputSchema: capabilitySchema({
        input_references: { type: "range", min: 0, max: 16 },
      }),
      uiSchema: {},
      defaults: {},
    }
    const orField = liveMediaFields(orDefinition)[0]!
    expect(orField.encoding).toBe("openrouter-image-references")
    const value = encodeLiveMediaUrls(orField, urls)
    expect(value).toEqual(
      urls.map((url) => ({ type: "image_url", image_url: { url } }))
    )
    expect(readLiveMediaUrls(orField, value)).toEqual(urls)
  })
  it("does not apply an unknown conditional branch as a made-up constraint", () => {
    const definition = {
      inputSchema: {
        type: "object",
        properties: {
          image_urls: {
            type: "array",
            maxItems: 16,
            items: { type: "string", format: "uri" },
          },
        },
        if: { unknownKeyword: "future" },
        then: { properties: { image_urls: { maxItems: 1 } } },
      },
      uiSchema: {},
      defaults: {},
    }
    expect(liveMediaFields(definition)[0]?.maxItems).toBe(16)
    expect(effectiveLiveSchema(definition)).toHaveProperty("if")
  })
})

describe("verified native reference mentions", () => {
  it("maps Kling4 reference arrays to the exact documented image/video tokens", () => {
    const fields = liveMediaFields(model("kling-video/v4.0/reference-to-video"))
    const image = fields.find((field) => field.key === "image_urls")!
    const video = fields.find((field) => field.key === "video_urls")!
    expect(liveMentionToken(image, 0)).toBe("@image_1")
    expect(liveMentionToken(image, 1)).toBe("@image_2")
    expect(liveMentionToken(video, 0)).toBe("@video_1")
    expect(liveMentionToken(image, 10)).toBeNull()
    expect(image.mentionSyntax?.sourceUrl).toContain(
      "/kling-video/v4.0/reference-to-video/api-reference"
    )
  })
  it("reserves Kling4 edit video1 for the source and starts extra videos at2", () => {
    const fields = liveMediaFields(model("kling-video/v4.0/video-edit"))
    expect(
      liveMentionToken(
        fields.find((field) => field.key === "video_url")!,
        0
      )
    ).toBe("@video_1")
    expect(
      liveMentionToken(
        fields.find((field) => field.key === "video_urls")!,
        0
      )
    ).toBe("@video_2")
    expect(
      liveMentionToken(
        fields.find((field) => field.key === "image_urls")!,
        0
      )
    ).toBe("@image_1")
  })
  it("remaps indices simultaneously on reordering and removes deleted asset tokens", () => {
    const fields = liveMediaFields(model("kling-video/v4.0/reference-to-video"))
    const field = fields.find((entry) => entry.key === "image_urls")!
    expect(
      remapLiveMentionTokens(
        "@image_1 meets @image_2, not @image_10",
        field,
        ["a", "b"],
        ["b", "a"]
      )
    ).toBe("@image_2 meets @image_1, not @image_10")
    expect(
      remapLiveMentionTokens(
        "@image_1 meets @image_2",
        field,
        ["a", "b"],
        ["b"]
      )
    ).toBe(" meets @image_1")
    expect(
      remapLiveMentionTokens("Use @image_1 and @image_2", field, ["a", "b"], [])
    ).toBe("Use  and ")
  })
  it("keeps source and additional edit-video token ranges separate", () => {
    const fields = liveMediaFields(model("kling-video/v4.0/video-edit"))
    const extra = fields.find((entry) => entry.key === "video_urls")!
    const source = fields.find((entry) => entry.key === "video_url")!
    expect(
      remapLiveMentionTokens("Edit @video_1 using @video_2", extra, ["ref"], [])
    ).toBe("Edit @video_1 using ")
    expect(
      remapLiveMentionTokens(
        "Edit @video_1 using @video_2",
        source,
        ["source"],
        []
      )
    ).toBe("Edit  using @video_2")
  })
  it("rejects dangling native references using the actual submitted field arrays", () => {
    const definition = model("kling-video/v4.0/reference-to-video")
    expect(
      validateNativeMentions(definition, {
        prompt: "@image_1 follows @video_1",
        image_urls: ["image"],
        video_urls: ["video"],
      })
    ).toEqual([])
    expect(
      validateNativeMentions(definition, {
        prompt: "Use @image_2 twice: @image_2",
        image_urls: ["image"],
      })
    ).toHaveLength(1)
    expect(
      validateNativeMentions(model("kling-video/v4.0/video-edit"), {
        prompt: "Edit @video_1 using @video_2",
        video_url: "source",
      })
    ).toHaveLength(1)
    expect(
      validateNativeMentions(
        model("bytedance/seedance-2.5/reference-to-video"),
        { prompt: "Literal @image_9" }
      )
    ).toEqual([])
  })
  it("never reuses Kling mention syntax for unsupported models or unverified fields", () => {
    for (const field of liveMediaFields(
      model("bytedance/seedance-2.5/reference-to-video")
    ))
      expect(liveMentionToken(field, 0)).toBeNull()
    const legacyFrame = liveMediaFields(
      model("kling-video/v4.0/reference-to-video")
    ).find((field) => field.key === "image_url")!
    expect(liveMentionToken(legacyFrame, 0)).toBeNull()
  })
})
