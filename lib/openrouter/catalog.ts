import "server-only"
import snapshot from "./catalog.snapshot.json"
import { estimateKnownImageCost } from "./pricing-calculator"
import { capabilitySchema, record, validateOpenRouterInput } from "./schema"
import type {
  OpenRouterCapability,
  OpenRouterCatalog,
  OpenRouterEndpoint,
  OpenRouterModel,
  OpenRouterPricingLine,
  OpenRouterQuote,
} from "./types"
export type {
  OpenRouterCapability,
  OpenRouterCatalog,
  OpenRouterEndpoint,
  OpenRouterModel,
  OpenRouterPricingLine,
  OpenRouterQuote,
} from "./types"
const ORIGIN = "https://openrouter.ai"
const MODEL_URL = `${ORIGIN}/api/v1/images/models`
const pathValid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(value) &&
  value.length < 200
const text = (value: unknown, limit = 1000) =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f]/g, " ").slice(0, limit)
    : ""
export function normalizeCapabilities(
  raw: unknown
): Record<string, OpenRouterCapability> {
  if (!record(raw)) throw new Error("Invalid image capabilities")
  const result: Record<string, OpenRouterCapability> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[a-z][a-z0-9_]{0,50}$/.test(key) || !record(value))
      throw new Error("Invalid image capability")
    if (
      value.type === "enum" &&
      Array.isArray(value.values) &&
      value.values.length > 0 &&
      value.values.length <= 100 &&
      value.values.every((v) => typeof v === "string" && v.length < 100)
    )
      result[key] = { type: "enum", values: value.values }
    else if (
      value.type === "range" &&
      typeof value.min === "number" &&
      Number.isInteger(value.min) &&
      typeof value.max === "number" &&
      Number.isInteger(value.max) &&
      value.min >= 0 &&
      value.max >= value.min &&
      value.max <= 2147483647
    )
      result[key] = { type: "range", min: value.min, max: value.max }
    else if (value.type === "boolean") result[key] = { type: "boolean" }
    else throw new Error("Unsupported image capability")
  }
  return result
}
function explicitDefaults(
  path: string,
  parameters: Record<string, OpenRouterCapability>
): Record<string, unknown> {
  const defaults: Record<string, unknown> = parameters.n ? { n: 1 } : {}
  if (
    path.startsWith("google/gemini") &&
    parameters.resolution?.type === "enum" &&
    parameters.resolution.values.includes("1K")
  )
    defaults.resolution = "1K"
  if (
    (path === "openai/gpt-image-2" ||
      path.startsWith("openai/gpt-image-2.5-")) &&
    parameters.quality?.type === "enum" &&
    parameters.quality.values.includes("low")
  )
    defaults.quality = "low"
  if (
    parameters.aspect_ratio?.type === "enum" &&
    parameters.aspect_ratio.values.includes("1:1")
  )
    defaults.aspect_ratio = "1:1"
  return defaults
}
export function normalizeOpenRouterModels(
  raw: unknown,
  fetchedAt: number,
  stale = false
): OpenRouterModel[] {
  if (
    !record(raw) ||
    !Array.isArray(raw.data) ||
    !raw.data.length ||
    raw.data.length > 500
  )
    throw new Error("Invalid OpenRouter image catalog")
  const models: OpenRouterModel[] = []
  for (const row of raw.data) {
    if (
      !record(row) ||
      !pathValid(row.id) ||
      !record(row.architecture) ||
      !Array.isArray(row.architecture.output_modalities) ||
      !row.architecture.output_modalities.includes("image")
    )
      throw new Error("Invalid image model")
    if (row.endpoints !== `/api/v1/images/models/${row.id}/endpoints`)
      throw new Error("Unexpected image endpoint URL")
    const parameters = normalizeCapabilities(row.supported_parameters)
    const output = parameters.output_format
    if (output?.type === "enum" && output.values.every((v) => v === "svg"))
      continue
    models.push({
      id: `or:${row.id}`,
      path: row.id,
      label: text(row.name, 200) || row.id,
      family: row.id.split("/")[0]!,
      surface: "image",
      description: text(row.description, 3000),
      inputSchema: capabilitySchema(
        parameters,
        explicitDefaults(row.id, parameters)
      ),
      defaults: explicitDefaults(row.id, parameters),
      supportedParameters: parameters,
      endpoints: [],
      fetchedAt,
      stale,
    })
  }
  if (!models.length) throw new Error("No supported raster image models")
  return models
}
export function normalizeOpenRouterEndpoints(
  raw: unknown,
  path: string
): OpenRouterEndpoint[] {
  if (
    !record(raw) ||
    raw.id !== path ||
    !Array.isArray(raw.endpoints) ||
    !raw.endpoints.length ||
    raw.endpoints.length > 100
  )
    throw new Error("Invalid image endpoints")
  return raw.endpoints.map((entry) => {
    if (
      !record(entry) ||
      typeof entry.provider_slug !== "string" ||
      !/^[a-z0-9][a-z0-9/_-]{0,100}$/i.test(entry.provider_slug) ||
      !(
        entry.provider_tag === null || typeof entry.provider_tag === "string"
      ) ||
      !Array.isArray(entry.pricing)
    )
      throw new Error("Invalid image provider")
    const pricing: OpenRouterPricingLine[] = entry.pricing.map((line) => {
      if (
        !record(line) ||
        typeof line.billable !== "string" ||
        !["image", "megapixel", "token"].includes(String(line.unit)) ||
        typeof line.cost_usd !== "number" ||
        !Number.isFinite(line.cost_usd) ||
        line.cost_usd < 0 ||
        (line.variant !== undefined && typeof line.variant !== "string")
      )
        throw new Error("Invalid image pricing")
      return {
        billable: text(line.billable, 100),
        unit: line.unit as OpenRouterPricingLine["unit"],
        cost_usd: line.cost_usd,
        ...(typeof line.variant === "string"
          ? { variant: text(line.variant, 100) }
          : {}),
      }
    })
    const supportedParameters = normalizeCapabilities(
      entry.supported_parameters
    )
    return {
      providerName: text(entry.provider_name, 200),
      providerSlug: entry.provider_slug,
      providerTag:
        typeof entry.provider_tag === "string" &&
        /^[a-z0-9][a-z0-9/_-]{0,100}$/i.test(entry.provider_tag)
          ? entry.provider_tag
          : null,
      supportedParameters,
      inputSchema: capabilitySchema(
        supportedParameters,
        explicitDefaults(path, supportedParameters)
      ),
      pricing,
    }
  })
}
export function selectOpenRouterEndpoint(
  model: OpenRouterModel,
  input: unknown
) {
  if (model.stale)
    throw new Error(
      "The current OpenRouter model schema is unavailable. Refresh before generating."
    )
  for (const endpoint of model.endpoints) {
    if (!endpoint.providerTag) continue
    const checked = validateOpenRouterInput(endpoint.inputSchema, input)
    if (checked.data) return { endpoint, input: checked.data }
  }
  throw new Error(
    "These image settings are not supported by an available OpenRouter provider."
  )
}
export function createOpenRouterCatalog(
  options: { fetcher?: typeof fetch; now?: () => number } = {}
) {
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? Date.now
  let models = normalizeOpenRouterModels(
    snapshot.models,
    snapshot.fetchedAt,
    true
  )
  let modelAt = 0
  let attemptedAt = 0
  let catalogPending: Promise<OpenRouterCatalog> | null = null
  const endpoints = new Map<
    string,
    { value: OpenRouterEndpoint[]; at: number }
  >()
  const detailPending = new Map<string, Promise<OpenRouterModel | null>>()
  async function read(url: string) {
    const response = await fetcher(url, {
      redirect: "error",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error("OpenRouter public catalog unavailable")
    const body = await response.text()
    if (body.length > 4_000_000)
      throw new Error("Image catalog exceeds safety limit")
    return JSON.parse(body) as unknown
  }
  function state(): OpenRouterCatalog {
    const stale = !modelAt || now() - modelAt >= 300000
    return structuredClone({
      models: models.map((m) => ({ ...m, stale })),
      fetchedAt: modelAt || snapshot.fetchedAt,
      stale,
      warnings: stale
        ? [
            "OpenRouter metadata is stale. Generation is disabled until refreshed.",
          ]
        : [],
    })
  }
  async function listOpenRouterModels(): Promise<OpenRouterCatalog> {
    if (modelAt && now() - modelAt < 300000) return state()
    if (catalogPending) return catalogPending
    if (attemptedAt && now() - attemptedAt < 15000) return state()
    attemptedAt = now()
    catalogPending = (async () => {
      try {
        const time = now()
        const next = normalizeOpenRouterModels(await read(MODEL_URL), time)
        models = next
        modelAt = time
      } catch {
        /* Preserve verified snapshot and its stale flag. */
      } finally {
        catalogPending = null
      }
      return state()
    })()
    return catalogPending
  }
  async function getOpenRouterModel(
    id: string
  ): Promise<OpenRouterModel | null> {
    const catalog = await listOpenRouterModels()
    const model = catalog.models.find((m) => m.id === id || m.path === id)
    if (!model) return null
    const old = endpoints.get(model.path)
    if (old && now() - old.at < 60000)
      return {
        ...model,
        endpoints: structuredClone(old.value),
        fetchedAt: Math.min(model.fetchedAt, old.at),
      }
    const pending = detailPending.get(model.path)
    if (pending) return pending
    const request = (async () => {
      try {
        const encoded = model.path.split("/").map(encodeURIComponent).join("/")
        const value = normalizeOpenRouterEndpoints(
          await read(`${MODEL_URL}/${encoded}/endpoints`),
          model.path
        )
        const at = now()
        endpoints.set(model.path, { value, at })
        return {
          ...model,
          endpoints: structuredClone(value),
          fetchedAt: Math.min(model.fetchedAt, at),
        }
      } catch {
        return {
          ...model,
          endpoints: structuredClone(old?.value ?? []),
          stale: true,
        }
      } finally {
        detailPending.delete(model.path)
      }
    })()
    detailPending.set(model.path, request)
    return request
  }
  async function quoteOpenRouterInput(
    modelOrId: string | OpenRouterModel,
    input: unknown
  ): Promise<OpenRouterQuote> {
    const model = await getOpenRouterModel(
      typeof modelOrId === "string" ? modelOrId : modelOrId.id
    )
    if (!model) throw new Error("This OpenRouter model is unavailable.")
    return quoteModel(model, input)
  }
  return { listOpenRouterModels, getOpenRouterModel, quoteOpenRouterInput }
}
const catalog = createOpenRouterCatalog()
export const listOpenRouterModels = catalog.listOpenRouterModels
export const getOpenRouterModel = catalog.getOpenRouterModel
export const quoteOpenRouterInput = catalog.quoteOpenRouterInput
function quoteModel(model: OpenRouterModel, input: unknown): OpenRouterQuote {
  const selected = selectOpenRouterEndpoint(model, input)
  const pricing = selected.endpoint.pricing
  const configured = estimateKnownImageCost(model.path, selected.input, pricing)
  if (configured)
    return {
      ...configured,
      estimated: true,
      providerTag: selected.endpoint.providerTag,
      pricing,
    }
  const count = Number(selected.input.n ?? 1)
  // Exact only for unambiguous flat per-image billing. Tokens, megapixels and
  // unresolved variant tiers cannot be predicted from public capability labels.
  if (
    pricing.length === 1 &&
    pricing[0]?.billable === "output_image" &&
    pricing[0].unit === "image" &&
    !pricing[0].variant
  )
    return {
      usd: pricing[0].cost_usd * count,
      estimated: true,
      explanation:
        "Published endpoint price for the requested image count. Final usage is returned after generation.",
      providerTag: selected.endpoint.providerTag,
      pricing,
    }
  return {
    usd: null,
    estimated: true,
    explanation:
      "This model bills by actual image/token usage. OpenRouter does not provide a fixed upfront image quote; final USD is returned after generation.",
    providerTag: selected.endpoint.providerTag,
    pricing,
  }
}
