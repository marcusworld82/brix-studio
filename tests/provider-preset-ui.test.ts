import { describe, expect, it } from "vitest"
import {
  parseProviderPresetPage,
  presetCatalogForPath,
  presetGeneratorHref,
  presetPreviewUrl,
  verifiedLinkedPreset,
} from "@/components/provider-presets/catalogs"
const page = {
  catalog: "marketing" as const,
  items: [{ id: "template-1", name: "Product" }],
  total: 1,
  fetchedAt: 1,
}
const model = "hf:marketing-studio/image/flare"
describe("provider preset UI boundaries", () => {
  it("only maps exact compatible operations", () => {
    expect(presetCatalogForPath("marketing-studio/image/flare")).toBe(
      "marketing"
    )
    expect(
      presetCatalogForPath("marketing-studio/image/flare/future")
    ).toBeNull()
    expect(presetCatalogForPath("higgsfield/genjutsu/restyle/v1.0")).toBe(
      "genjutsu"
    )
  })
  it("links a look without triggering generation", () => {
    const href = new URL(
      presetGeneratorHref("marketing", "a&b"),
      "https://example.test"
    )
    expect(href.pathname).toBe("/image")
    expect(href.searchParams.get("providerPreset")).toBe("a&b")
    expect(href.searchParams.get("liveModel")).toBe("hf:marketing-studio/image")
    expect(href.searchParams.has("generate")).toBe(false)
  })
  it("requires account membership and unchanged model before applying a URL", () => {
    expect(
      verifiedLinkedPreset(page, model, model, "marketing", "template-1")?.id
    ).toBe("template-1")
    expect(
      verifiedLinkedPreset(page, model, model, "marketing", "removed")
    ).toBeNull()
    expect(
      verifiedLinkedPreset(
        page,
        "hf:marketing-studio/image/sunburst",
        model,
        "marketing",
        "template-1"
      )
    ).toBeNull()
    expect(
      verifiedLinkedPreset(page, model, model, "soul-v2", "template-1")
    ).toBeNull()
  })
  it("rejects incomplete, duplicate or wrong catalog responses", () => {
    expect(parseProviderPresetPage(page, "marketing")).toEqual(page)
    expect(
      parseProviderPresetPage({ ...page, total: 2 }, "marketing")
    ).toBeNull()
    expect(
      parseProviderPresetPage(
        { ...page, items: [...page.items, ...page.items], total: 2 },
        "marketing"
      )
    ).toBeNull()
    expect(parseProviderPresetPage(page, "soul-v1")).toBeNull()
    expect(
      parseProviderPresetPage({ ...page, items: [], total: 0 }, "marketing")
        ?.total
    ).toBe(0)
  })
  it("previews only HTTPS media without embedded credentials", () => {
    expect(presetPreviewUrl("https://cdn.higgsfield.ai/image.jpg")).toBeTruthy()
    expect(presetPreviewUrl("javascript:alert(1)")).toBeNull()
    expect(presetPreviewUrl("https://secret@example.test/x")).toBeNull()
  })
})
