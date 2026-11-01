import "server-only"
import { getOpenRouterModel, selectOpenRouterEndpoint } from "./catalog"
import { record } from "./schema"
import type { OpenRouterImageResult, OpenRouterModel } from "./types"
export class OpenRouterError extends Error {
  constructor(
    readonly status: number,
    readonly requestId: string | null = null
  ) {
    super(
      status === 401
        ? "OpenRouter rejected this API key. Reconnect it in Account."
        : status === 402
          ? "Your OpenRouter balance is too low."
          : status === 429
            ? "OpenRouter is busy. Wait before trying again."
            : "OpenRouter rejected this image request."
    )
    this.name = "OpenRouterError"
  }
}
export class AmbiguousOpenRouterError extends Error {
  constructor(
    readonly status: number | null = null,
    readonly requestId: string | null = null
  ) {
    super(
      "The image request outcome is uncertain. Do not submit it again automatically."
    )
    this.name = "AmbiguousOpenRouterError"
  }
}
export function validOpenRouterApiKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 4096 &&
    /^[\x21-\x7e]+$/.test(value)
  )
}
const MAX_OUTPUT = 50 * 1024 * 1024
async function boundedText(response: Response): Promise<string> {
  if (!response.body) throw new Error("Missing image response")
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.length
      if (total > Math.ceil((MAX_OUTPUT * 4) / 3) + 1_000_000)
        throw new Error("Image response exceeds limit")
      parts.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(parts).toString("utf8")
}
function rasterType(
  bytes: Buffer
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png"
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg"
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp"
  return null
}
export function decodeOpenRouterResult(
  raw: unknown,
  requestId: string | null
): OpenRouterImageResult {
  if (
    !record(raw) ||
    !Array.isArray(raw.data) ||
    raw.data.length < 1 ||
    raw.data.length > 10
  )
    throw new Error("Invalid image response")
  let total = 0
  const images = raw.data.map((image) => {
    if (
      !record(image) ||
      typeof image.b64_json !== "string" ||
      image.b64_json.length > Math.ceil((MAX_OUTPUT * 4) / 3) + 4 ||
      image.b64_json.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(image.b64_json)
    )
      throw new Error("Invalid image encoding")
    const bytes = Buffer.from(image.b64_json, "base64")
    if (!bytes.length || bytes.toString("base64") !== image.b64_json)
      throw new Error("Invalid image encoding")
    total += bytes.length
    if (total > MAX_OUTPUT) throw new Error("Image output exceeds limit")
    const contentType = rasterType(bytes)
    if (
      !contentType ||
      (image.media_type !== undefined && image.media_type !== contentType)
    )
      throw new Error("Unsupported or mismatched image format")
    return { bytes, contentType }
  })
  const usage = record(raw.usage) ? raw.usage : null
  const cost = usage?.cost
  if (
    cost !== undefined &&
    cost !== null &&
    (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0)
  )
    throw new Error("Invalid image cost")
  return {
    requestId: typeof raw.id === "string" ? raw.id.slice(0, 200) : requestId,
    images,
    actualCostUsd: typeof cost === "number" ? cost : null,
  }
}
export function createOpenRouterClient(options: {
  apiKey: string
  fetch?: typeof fetch
  getModel?: (id: string) => Promise<OpenRouterModel | null>
}) {
  if (!validOpenRouterApiKey(options.apiKey))
    throw new Error(
      "Paste the complete OpenRouter API key without spaces or headers."
    )
  const fetcher = options.fetch ?? fetch
  return {
    async generateImage(
      modelId: string,
      raw: unknown
    ): Promise<OpenRouterImageResult> {
      const model = await (options.getModel ?? getOpenRouterModel)(modelId)
      if (!model)
        throw new Error(
          "This image model is not in the current OpenRouter catalog."
        )
      const selected = selectOpenRouterEndpoint(model, raw)
      const body = {
        ...selected.input,
        model: model.path,
        stream: false,
        provider: {
          only: [selected.endpoint.providerTag!],
          allow_fallbacks: false,
        },
      }
      let response: Response
      try {
        // Never retry a paid POST. Root lifecycle records ambiguous outcomes.
        response = await fetcher("https://openrouter.ai/api/v1/images", {
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(180_000),
        })
      } catch {
        throw new AmbiguousOpenRouterError()
      }
      const requestId =
        response.headers.get("x-request-id")?.slice(0, 200) ?? null
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        if (response.status >= 500 || response.status === 408)
          throw new AmbiguousOpenRouterError(response.status, requestId)
        throw new OpenRouterError(response.status, requestId)
      }
      try {
        return decodeOpenRouterResult(
          JSON.parse(await boundedText(response)),
          requestId
        )
      } catch {
        throw new AmbiguousOpenRouterError(response.status, requestId)
      }
    },
  }
}
/** Explicit subscription owner account. Personal helpers never call this. */
export function ownerOpenRouterClient() {
  if (process.env.BRIX_EDITION !== "subscription")
    throw new Error(
      "Owner OpenRouter credentials are only available to the subscription edition."
    )
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey)
    throw new Error("The subscription OpenRouter provider is not configured.")
  return createOpenRouterClient({ apiKey })
}
export const subscriptionOpenRouterClient = ownerOpenRouterClient
