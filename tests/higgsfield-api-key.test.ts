import { describe, it, expect, vi } from "vitest"
import { createHiggsfieldClient } from "@/lib/higgsfield/client"
import { isCompleteApiKey } from "@/lib/higgsfield/api-key"
describe("Complete copied Higgsfield API key", () => {
  for (const key of [
    "hf-opaque-example-api-key",
    "example-id:example-secret",
  ]) {
    it("sends the entire key unchanged using the Key scheme", async () => {
      const request = vi.fn(
        async (input: RequestInfo | URL, options?: RequestInit) => {
          expect(input).toBe(
            "https://api.higgsfield.ai/estimate/higgsfield-ai/soul/v2/standard"
          )
          expect(new Headers(options?.headers).get("Authorization")).toBe(
            `Key ${key}`
          )
          return new Response(
            JSON.stringify({ type: "numeric", credits: 1, usd: 0.01 }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        }
      )
      const client = createHiggsfieldClient({
        credentials: key,
        baseUrl: "https://api.higgsfield.ai",
        fetch: request,
      })
      await client.estimate("higgsfield-ai/soul/v2/standard", {
        prompt: "test",
        batch_size: 1,
      })
      const options = request.mock.calls[0]?.[1] as RequestInit | undefined
      expect(new Headers(options?.headers).get("Authorization")).toBe(
        `Key ${key}`
      )
    })
  }
  it("blocks empty, oversized, whitespace and header-injection values", () => {
    for (const value of [
      "",
      "x".repeat(4097),
      "Key key-value",
      "test\r\nAuthorization:bad",
      "hidden\u200bkey",
    ]) {
      expect(isCompleteApiKey(value)).toBe(false)
      expect(() =>
        createHiggsfieldClient({
          credentials: value,
          baseUrl: "https://api.higgsfield.ai",
        })
      ).toThrow()
    }
  })
})
