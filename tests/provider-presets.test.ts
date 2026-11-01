import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHiggsfieldClient } from "@/lib/higgsfield/client"
import type { ProviderPresetCatalog } from "@/lib/higgsfield/preset-types"
const mocks = vi.hoisted(() => ({ personal: vi.fn(), platform: vi.fn() }))
vi.mock("@/lib/supabase/connections", () => ({
  clientForConnection: mocks.personal,
}))
vi.mock("@/lib/supabase/platform-connections", () => ({
  platformHiggsfieldClient: mocks.platform,
}))
import {
  fetchProviderPresets,
  listUserProviderPresets,
  validateProviderPresetSelection,
} from "@/lib/higgsfield/presets"
const id = "5f7e5c32-068e-533b-b10e-fca42ca993af"
const otherId = "7ee16ff3-c0b0-4f5f-a0e1-e7fc46144230"
function client(pages: unknown[]) {
  const fetch = vi
    .fn()
    .mockImplementation(async () => Response.json(pages.shift()))
  return {
    api: createHiggsfieldClient({
      credentials: "key-id:key-secret",
      baseUrl: "https://api.higgsfield.ai",
      fetch,
      sleep: async () => {},
    }),
    fetch,
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("BRIX_EDITION", "personal")
})
afterEach(() => vi.unstubAllEnvs())
describe("private provider preset catalogs", () => {
  it("fetches every marketing page from fixed paths and returns sanitized metadata only", async () => {
    const { api, fetch } = client([
      {
        total: 2,
        cursor: 1,
        items: [
          {
            id,
            name: "  <b>Campaign</b>\u0000  ",
            cover_image: { url: "https://cdn.higgsfield.ai/cover.webp" },
            secret: "private",
            prompt: "hidden instruction",
          },
        ],
      },
      {
        total: 2,
        cursor: null,
        items: [
          {
            id: otherId,
            name: "Second",
            preview_url: "http://unsafe.test/preview",
            description: "Short description",
          },
        ],
      },
    ])
    const result = await fetchProviderPresets(api, "marketing")
    expect(result).toMatchObject({
      catalog: "marketing",
      total: 2,
      items: [
        {
          id,
          name: "Campaign",
          previewImage: "https://cdn.higgsfield.ai/cover.webp",
        },
        { id: otherId, name: "Second", description: "Short description" },
      ],
    })
    expect(JSON.stringify(result)).not.toMatch(
      /private|hidden instruction|unsafe.test|<b>/
    )
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "https://api.higgsfield.ai/marketing-studio/image/presets?size=50",
      "https://api.higgsfield.ai/marketing-studio/image/presets?size=50&cursor=1",
    ])
    expect(
      fetch.mock.calls.every(
        (call) => call[1].cache === "no-store" && call[1].redirect === "error"
      )
    ).toBe(true)
  })
  it.each(["soul-v2", "soul-v1"] as const)(
    "normalizes the observed %s plain array",
    async (catalog) => {
      const { api } = client([
        [{ id, name: "Soul", preview_url: "https://cdn.higgsfield.ai/a.webp" }],
      ])
      expect(await fetchProviderPresets(api, catalog)).toMatchObject({
        catalog,
        total: 1,
        items: [{ id, name: "Soul" }],
      })
    }
  )
  it("filters hidden/invalid entries and rejects non-HTTPS or credential-bearing previews", async () => {
    const { api } = client([
      {
        model: "higgsfield/genjutsu/restyle/v1.0",
        items: [
          {
            id,
            name: "Visible",
            preview_url: "https://name:secret@cdn.test/a",
            preview_video: "javascript:bad",
          },
          { id: otherId, name: "Hidden", hidden: true },
          { id: "bad", name: "Invalid" },
        ],
      },
    ])
    expect(await fetchProviderPresets(api, "genjutsu")).toMatchObject({
      total: 1,
      items: [{ id, name: "Visible" }],
    })
  })
  it.each(
    [
      [{ total: 3, cursor: null, items: [{ id, name: "One" }] }],
      [
        { total: 2, cursor: 1, items: [{ id, name: "One" }] },
        { total: 2, cursor: null, items: [{ id, name: "Duplicate" }] },
      ],
      [
        {
          total: 2,
          cursor: "https://evil.test/key",
          items: [{ id, name: "One" }],
        },
      ],
      [
        { total: 2, cursor: 1, items: [{ id, name: "One" }] },
        { total: 3, cursor: null, items: [{ id: otherId, name: "Two" }] },
      ],
      [{ total: 1001, cursor: null, items: [] }],
      [{ items: "wrong" }],
    ].map((pages) => [pages])
  )(
    "fails closed on partial, repeated, unbounded or invalid pages",
    async (pages) => {
      const { api } = client([...pages])
      await expect(fetchProviderPresets(api, "marketing")).rejects.toThrow(
        "Preset catalog could not be loaded"
      )
    }
  )
  it("does not expose upstream response errors or permit arbitrary paths", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "SECRET-UPSTREAM" }), {
        status: 401,
      })
    )
    const api = createHiggsfieldClient({
      credentials: "key-id:key-secret",
      baseUrl: "https://api.higgsfield.ai",
      fetch,
    })
    await expect(fetchProviderPresets(api, "soul-v2")).rejects.toThrow(
      /^Preset catalog could not be loaded/
    )
    await expect(
      api.presetCatalogPage("https://evil.test" as ProviderPresetCatalog)
    ).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it("routes personal requests solely through their user connection, without shared fallback or cache", async () => {
    const { api, fetch } = client([
      [{ id, name: "First" }],
      [{ id: otherId, name: "Other" }],
    ])
    mocks.personal.mockResolvedValue({ client: api })
    expect(
      (await listUserProviderPresets("owner", "soul-v2")).items[0].id
    ).toBe(id)
    expect(
      (await listUserProviderPresets("other", "soul-v2")).items[0].id
    ).toBe(otherId)
    expect(mocks.personal.mock.calls).toEqual([["owner"], ["other"]])
    expect(mocks.platform).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(2)
    mocks.personal.mockRejectedValue(new Error("private error"))
    await expect(
      listUserProviderPresets("missing", "soul-v2")
    ).rejects.toThrow()
    expect(mocks.platform).not.toHaveBeenCalled()
  })
  it("routes subscription through the saved studio connection", async () => {
    vi.stubEnv("BRIX_EDITION", "subscription")
    const { api } = client([[{ id, name: "Studio" }]])
    mocks.platform.mockResolvedValue({ client: api })
    await listUserProviderPresets("owner", "soul-v1")
    expect(mocks.platform).toHaveBeenCalledOnce()
    expect(mocks.personal).not.toHaveBeenCalled()
  })
  it("checks selected membership against the current account catalog and rejects withdrawals", async () => {
    const { api } = client([[{ id, name: "Known" }], []])
    await expect(
      validateProviderPresetSelection(api, "higgsfield-ai/soul/v2/standard", {
        style_id: id,
      })
    ).resolves.toBeUndefined()
    await expect(
      validateProviderPresetSelection(api, "higgsfield-ai/soul/v2/standard", {
        style_id: id,
      })
    ).rejects.toThrow(/available/)
  })
  it("validates marketing presets only with enhancement and leaves unrelated models alone", async () => {
    const { api, fetch } = client([])
    await validateProviderPresetSelection(api, "marketing-studio/image/flare", {
      preset_id: id,
      enhance_prompt: false,
    })
    await validateProviderPresetSelection(api, "google/nano-banana-2", {
      style_id: id,
    })
    await expect(
      validateProviderPresetSelection(api, "marketing-studio/image/flare", {
        enhance_prompt: true,
        preset_id: "invalid",
      })
    ).rejects.toThrow(/valid preset/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
