import { beforeEach, expect, it, vi } from "vitest"
import { UnauthorizedError } from "@/lib/errors"
import { RateLimitError } from "@/lib/rate-limit"
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  list: vi.fn(),
  limit: vi.fn(),
}))
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: mocks.limit,
}))
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.user }))
vi.mock("@/lib/higgsfield/presets", () => ({
  listUserProviderPresets: mocks.list,
}))
import { GET } from "@/app/api/provider-presets/route"
beforeEach(() => {
  vi.clearAllMocks()
  mocks.limit.mockResolvedValue(undefined)
  mocks.user.mockResolvedValue({ id: "verified-owner" })
})
it("requires sign-in before any provider catalog access", async () => {
  mocks.user.mockRejectedValue(new UnauthorizedError())
  const response = await GET(
    new Request("https://studio.test/api/provider-presets?catalog=marketing")
  )
  expect(response.status).toBe(401)
  expect(mocks.limit).not.toHaveBeenCalled()
  expect(mocks.list).not.toHaveBeenCalled()
  expect(response.headers.get("cache-control")).toBe("private, no-store")
})
it("accepts only the fixed catalog allowlist", async () => {
  for (const catalog of ["", "https://evil.test", "../secret"]) {
    const response = await GET(
      new Request(
        `https://studio.test/api/provider-presets?catalog=${encodeURIComponent(catalog)}`
      )
    )
    expect(response.status).toBe(400)
  }
  expect(mocks.list).not.toHaveBeenCalled()
})
it("uses the verified owner and returns complete private no-store metadata", async () => {
  const page = { catalog: "soul-v2", items: [], total: 0, fetchedAt: 1 }
  mocks.list.mockResolvedValue(page)
  const response = await GET(
    new Request(
      "https://studio.test/api/provider-presets?catalog=soul-v2&userId=attacker"
    )
  )
  expect(mocks.list).toHaveBeenCalledWith("verified-owner", "soul-v2")
  expect(mocks.limit).toHaveBeenCalledWith(
    "provider-presets:verified-owner",
    60,
    60
  )
  expect(await response.json()).toEqual(page)
  expect(response.headers.get("cache-control")).toBe("private, no-store")
})
it("rate limits each signed-in owner before provider requests", async () => {
  mocks.limit.mockRejectedValue(new RateLimitError("Stop", new Date()))
  const response = await GET(
    new Request("https://studio.test/api/provider-presets?catalog=marketing")
  )
  expect(response.status).toBe(429)
  expect(mocks.list).not.toHaveBeenCalled()
  expect(response.headers.get("cache-control")).toBe("private, no-store")
})
it("does not leak provider errors or credentials", async () => {
  mocks.list.mockRejectedValue(new Error("secret-key and internal URL"))
  const response = await GET(
    new Request("https://studio.test/api/provider-presets?catalog=genjutsu")
  )
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain("secret-key")
})
