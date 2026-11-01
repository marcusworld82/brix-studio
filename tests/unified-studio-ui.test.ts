import { describe, expect, it } from "vitest"
import {
  liveFieldDisplay,
  orderLiveFields,
  visibleFieldErrors,
  mediaLimitMessage,
} from "@/components/generator/live-field-display"
import {
  videoWorkflow,
  workflowModel,
} from "@/components/generator/video-workflow"
import type {
  LiveModelDefinition,
  LiveModelSummary,
} from "@/generation/catalog/live-types"

const definition = (
  patch: Partial<LiveModelDefinition> = {}
): LiveModelDefinition => ({
  id: "hf:fixture/model",
  path: "fixture/model",
  label: "Fixture",
  family: "Fixture",
  surface: "video",
  description: "",
  inputSchema: {},
  uiSchema: {},
  defaults: {},
  fetchedAt: 0,
  stale: false,
  pricingDescription: null,
  ...patch,
})
const model = (
  path: string,
  family: string,
  surface: "image" | "video" = "video"
): LiveModelSummary => ({
  id: `hf:${path}`,
  path,
  label: path,
  family,
  surface,
  description: "",
})

describe("provider-specific inline presentation", () => {
  it("excludes hidden aliases and honors conditional visibility and defaults", () => {
    const d = definition({
      defaults: { enhance_prompt: false },
      uiSchema: {
        elements: { "ui:widget": "hidden" },
        image_url: { "ui:widget": "fullHidden" },
        preset_id: {
          "ui:options": {
            advanced: true,
            visibleWhen: { field: "enhance_prompt", equals: true },
          },
        },
      },
    })
    expect(liveFieldDisplay(d, "elements", {}, {}).hidden).toBe(true)
    expect(liveFieldDisplay(d, "image_url", {}, {}).hidden).toBe(true)
    expect(liveFieldDisplay(d, "preset_id", {}, {})).toMatchObject({
      hidden: true,
      advanced: true,
    })
    expect(
      liveFieldDisplay(d, "preset_id", {}, { enhance_prompt: true }).hidden
    ).toBe(false)
  })
  it("uses provider labels and explicit frame roles without pretending all image inputs are start frames", () => {
    const kling = definition({ path: "kling-video/v4.0/image-to-video" })
    expect(liveFieldDisplay(kling, "image_url", {}, {}).label).toBe(
      "First frame"
    )
    expect(liveFieldDisplay(kling, "end_image_url", {}, {}).label).toBe(
      "Last frame"
    )
    expect(liveFieldDisplay(kling, "image_urls", {}, {}).label).toBe(
      "Middle frames"
    )
    expect(
      liveFieldDisplay(definition(), "image_url", { title: "Source image" }, {})
        .label
    ).toBe("Source image")
    expect(
      liveFieldDisplay(
        definition({
          uiSchema: { quality: { "ui:options": { label: "Quality level" } } },
        }),
        "quality",
        {},
        {}
      ).label
    ).toBe("Quality level")
  })
  it("keeps wildcard and unlisted future controls in provider order", () => {
    const props = { seed: {}, resolution: {}, prompt: {}, future_control: {} }
    expect(
      orderLiveFields(
        definition({ uiSchema: { "ui:order": ["prompt", "*", "resolution"] } }),
        props
      ).map(([key]) => key)
    ).toEqual(["prompt", "seed", "future_control", "resolution"])
    expect(
      orderLiveFields(
        definition({ uiSchema: { "ui:order": ["prompt"] } }),
        props
      )
    ).toHaveLength(4)
  })
  it("drops errors belonging to a control hidden by the next parameter state", () => {
    const d = definition({
      uiSchema: {
        preset_id: {
          "ui:options": {
            visibleWhen: { field: "enhance_prompt", equals: true },
          },
        },
      },
    })
    expect(
      visibleFieldErrors(
        d,
        { enhance_prompt: false },
        { preset_id: { type: "string" }, seed: { type: "integer" } },
        { preset_id: "Invalid JSON", seed: "Invalid value" }
      )
    ).toEqual({ seed: "Invalid value" })
  })
  it("names the displayed media role and uses singular or plural file text", () => {
    expect(mediaLimitMessage("First frame", "image", 1, "minimum")).toBe(
      "First frame: add at least 1 image file."
    )
    expect(mediaLimitMessage("Reference images", "image", 16, "maximum")).toBe(
      "Reference images: maximum 16 image files."
    )
  })
})

describe("video workflow shortcuts", () => {
  it("recognizes explicit operation names and leaves unknown paths unclassified", () => {
    expect(videoWorkflow("kling-video/v3.0/pro/image-to-video")).toBe("create")
    expect(videoWorkflow("higgsfield/genjutsu/object-swap/v1.0")).toBe("edit")
    expect(videoWorkflow("higgsfield/genjutsu/motion-transfer/v1.0")).toBe(
      "motion"
    )
    expect(videoWorkflow("future-provider/new-feature/v2")).toBeNull()
    expect(videoWorkflow("motion-control/future-unknown-operation")).toBeNull()
  })
  it("prefers the selected family, falls back to a real available operation, and never mutates the full catalog", () => {
    const catalog = [
      model("other/video-edit", "Other"),
      model("kling-video/v4.0/video-edit", "Kling"),
      model("higgsfield/motion-transfer/v1", "Genjutsu"),
      model("future/new-mode", "Future"),
      model("image/video-edit", "Kling", "image"),
    ]
    expect(workflowModel(catalog, "edit", "Kling")?.path).toBe(
      "kling-video/v4.0/video-edit"
    )
    expect(workflowModel(catalog, "motion", "Kling")?.family).toBe("Genjutsu")
    expect(workflowModel(catalog, "create", "Kling")).toBeNull()
    expect(catalog).toHaveLength(5)
  })
})
