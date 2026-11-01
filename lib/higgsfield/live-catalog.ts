import "server-only"
import bundledSnapshot from "./catalog.snapshot.json"
import type {
  LiveCatalog,
  LiveCatalogSnapshot,
  LiveModelDefinition,
  LiveModelSummary,
  PublishedPrice,
  PublishedPricing,
} from "@/generation/catalog/live-types"

const BASE = "https://dash.higgsfield.ai"
export const CATALOG_PATH = "/api/v2/catalog-models/"
export const PRICING_PATH = "/api/v2/pricing/models/"
const METADATA_TTL = 5 * 60_000
const PRICING_TTL = 60_000
const MAX_PAGES = 20
// Public app-model detail and authenticated presets are verified, but this API
// mode is currently absent from both discovery feeds. Reverify its detail before
// listing it; never promote an arbitrary client-provided path.
const RESTYLE_PATH = "higgsfield/genjutsu/restyle/v1.0"
export type CatalogFetch = (
  url: string,
  init?: RequestInit
) => Promise<Response>
type Row = Record<string, unknown>
export function isRecord(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
const text = (value: unknown, max = 500) =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f]/g, " ").slice(0, max)
    : ""
const pathValid = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 200 &&
  value.split("/").length <= 6 &&
  value.split("/").every((part) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part))
const surface = (value: unknown): value is LiveModelSummary["surface"] =>
  value === "image" || value === "video" || value === "audio"
function safeImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString().slice(0, 2000)
      : undefined
  } catch {
    return undefined
  }
}
/** Bound public JSON size and remove prototype-related keys before returning it to clients. */
export function sanitizePublicJson(value: unknown, depth = 0): unknown {
  if (depth > 40) throw new Error("Provider metadata is too deeply nested")
  if (value === null || typeof value === "boolean" || typeof value === "number")
    return value
  if (typeof value === "string") {
    if (value.length > 100_000)
      throw new Error("Provider metadata string is too large")
    return value
  }
  if (Array.isArray(value)) {
    if (value.length > 2000)
      throw new Error("Provider metadata array is too large")
    return value.map((item) => sanitizePublicJson(item, depth + 1))
  }
  if (isRecord(value)) {
    if (Object.keys(value).some((key) => key.length > 200))
      throw new Error("Provider metadata key is too long")
    if (Object.keys(value).length > 2000)
      throw new Error("Provider metadata object is too large")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) => !["__proto__", "prototype", "constructor"].includes(key)
        )
        .map(([key, item]) => [
          key.slice(0, 200),
          sanitizePublicJson(item, depth + 1),
        ])
    )
  }
  return null
}
function validMoney(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) &&
    Number.isFinite(Number(value))
  )
}
function publishedPrice(value: unknown): PublishedPrice | null {
  if (
    !isRecord(value) ||
    !validMoney(value.amount) ||
    (value.original_amount !== undefined &&
      value.original_amount !== null &&
      !validMoney(value.original_amount)) ||
    (value.discount_percentage !== undefined &&
      value.discount_percentage !== null &&
      (typeof value.discount_percentage !== "number" ||
        !Number.isFinite(value.discount_percentage) ||
        value.discount_percentage < 0 ||
        value.discount_percentage > 100)) ||
    typeof value.currency !== "string" ||
    typeof value.unit !== "string"
  )
    return null
  const clean = sanitizePublicJson(value)
  return clean as PublishedPrice
}
function pricing(value: unknown): PublishedPricing | undefined {
  if (!isRecord(value)) return undefined
  const primary = publishedPrice(value.primary)
  if (!primary) return undefined
  const options = Array.isArray(value.options)
    ? value.options
        .map(publishedPrice)
        .filter((entry): entry is PublishedPrice => entry !== null)
    : []
  return {
    primary,
    options,
    ...(isRecord(value.max_discount)
      ? { max_discount: sanitizePublicJson(value.max_discount) }
      : {}),
  }
}
function thumbnail(row: Row): string | undefined {
  return (
    safeImage(
      isRecord(row.preview_image) ? row.preview_image.url : row.preview_image
    ) ??
    safeImage(
      isRecord(row.preview_video) ? row.preview_video.thumbnail_url : undefined
    )
  )
}
/** These public model schemas and model docs explicitly identify the renderer.
 * https://open.higgsfield.ai/models/marketing-studio/image/flare/api-reference
 * https://open.higgsfield.ai/models/marketing-studio/image/sunburst/api-reference
 * API paths and the Higgsfield provider remain unchanged.
 */
const rendererLabels: Record<string, string> = {
  "marketing-studio/image/flare": "GPT Image 2.5 Flare",
  "marketing-studio/image/sunburst": "GPT Image 2.5 Sunburst",
}
function summary(
  row: Row,
  family: Row,
  path: string,
  output: LiveModelSummary["surface"]
): LiveModelSummary {
  return {
    id: `hf:${path}`,
    path,
    label:
      rendererLabels[path] ||
      text(row.display_title) ||
      [text(row.title) || text(family.title), text(row.variant_title)]
        .filter(Boolean)
        .join(" · ") ||
      path,
    family: rendererLabels[path]
      ? "GPT Image 2.5"
      : text(family.title) || text(family.model_slug) || text(family.slug),
    surface: output,
    description: text(
      row.description ||
        row.og_description ||
        family.description ||
        family.og_description,
      2000
    ),
    previewImage: thumbnail(row) ?? thumbnail(family),
    ...(pricing(row.pricing) ? { pricing: pricing(row.pricing) } : {}),
  }
}

export function normalizeLiveCatalog(
  catalogRows: unknown[],
  pricingRows: unknown[]
): LiveModelSummary[] {
  const models = new Map<string, LiveModelSummary>()
  for (const raw of catalogRows) {
    if (!isRecord(raw)) throw new Error("Invalid catalog family")
    if (raw.catalog_type !== "model" || raw.availability_state !== "available")
      continue
    if (!Array.isArray(raw.entry_points))
      throw new Error("Invalid catalog entry points")
    for (const entry of raw.entry_points) {
      if (!isRecord(entry) || !pathValid(entry.mode_id))
        throw new Error("Invalid catalog mode")
      if (!surface(entry.output_type)) continue
      const model = summary(raw, raw, entry.mode_id, entry.output_type)
      models.set(model.id, model)
    }
  }
  for (const raw of pricingRows) {
    if (!isRecord(raw) || !Array.isArray(raw.modes))
      throw new Error("Invalid pricing family")
    if (raw.availability_state !== "available") continue
    for (const mode of raw.modes) {
      if (!isRecord(mode) || !pathValid(mode.slug))
        throw new Error("Invalid priced mode")
      if (mode.availability_state !== "available" || !surface(mode.output_type))
        continue
      const model = summary(mode, raw, mode.slug, mode.output_type)
      const previous = models.get(model.id)
      models.set(model.id, {
        ...previous,
        ...model,
        previewImage: model.previewImage ?? previous?.previewImage,
      })
    }
  }
  if (!models.size) throw new Error("Provider catalog is empty")
  return [...models.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function normalizeLiveDefinition(
  model: LiveModelSummary,
  raw: unknown,
  fetchedAt: number,
  stale = false
): LiveModelDefinition {
  if (
    !isRecord(raw) ||
    (raw.availability_state !== undefined &&
      raw.availability_state !== "available") ||
    raw.slug !== model.path ||
    !isRecord(raw.input_schema) ||
    raw.input_schema.type !== "object" ||
    !isRecord(raw.input_schema.properties)
  )
    throw new Error("Invalid model schema")
  const inputSchema = sanitizePublicJson(raw.input_schema) as Row
  const uiSchema = isRecord(raw.ui_schema)
    ? (sanitizePublicJson(raw.ui_schema) as Row)
    : {}
  const defaults: Row = {}
  for (const [key, value] of Object.entries(raw.input_schema.properties)) {
    if (!isRecord(value) || !("default" in value)) continue
    const permitsNull =
      value.type === undefined ||
      value.type === "null" ||
      value.nullable === true ||
      (Array.isArray(value.type) && value.type.includes("null"))
    if (value.default === null && !permitsNull) continue
    defaults[key] = sanitizePublicJson(value.default)
  }
  // Playground initial_values are demo prompts, not generation defaults.
  return {
    ...model,
    inputSchema,
    uiSchema,
    defaults,
    pricingDescription: text(raw.pricing_description, 20_000) || null,
    fetchedAt,
    stale,
  }
}

export async function fetchPublicPages(
  fetcher: CatalogFetch,
  endpoint: typeof CATALOG_PATH | typeof PRICING_PATH
): Promise<unknown[]> {
  let url: string | null = `${BASE}${endpoint}?page=1&page_size=50`
  const seen = new Set<string>()
  const rows: unknown[] = []
  let expectedCount: number | null = null
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const parsed: URL = new URL(url, BASE)
    if (
      parsed.origin !== BASE ||
      parsed.pathname !== endpoint ||
      parsed.username ||
      parsed.password ||
      seen.has(parsed.toString())
    )
      throw new Error("Unsafe catalog pagination")
    seen.add(parsed.toString())
    const response = await fetcher(parsed.toString(), {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    })
    if (!response.ok)
      throw new Error(`Public catalog unavailable (${response.status})`)
    const body = await response.text()
    if (body.length > 4_000_000)
      throw new Error("Public catalog response too large")
    const data: unknown = JSON.parse(body)
    if (
      !isRecord(data) ||
      !Array.isArray(data.results) ||
      typeof data.count !== "number" ||
      !Number.isInteger(data.count) ||
      data.count < 0 ||
      data.count > 10_000 ||
      !(data.next === null || typeof data.next === "string")
    )
      throw new Error("Invalid public catalog response")
    if (expectedCount !== null && data.count !== expectedCount)
      throw new Error("Public catalog changed during pagination")
    expectedCount = data.count
    rows.push(...data.results)
    if (rows.length > 10_000)
      throw new Error("Public catalog exceeds safety limit")
    url = data.next === null ? null : new URL(data.next, BASE).toString()
  }
  if (url) throw new Error("Public catalog pagination limit reached")
  // The live catalog count includes a hidden family (39 count, 38 public results).
  // Follow next links; do not treat that documented observation as a truncated page.
  if (expectedCount !== null && rows.length > expectedCount)
    throw new Error("Invalid public catalog result count")
  if (!rows.length) throw new Error("Public catalog feed is empty")
  return rows
}

export function createLiveCatalogClient(
  options: {
    fetcher?: CatalogFetch
    now?: () => number
    snapshot?: LiveCatalogSnapshot
  } = {}
) {
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? Date.now
  const snapshot = options.snapshot ?? (bundledSnapshot as LiveCatalogSnapshot)
  let models = structuredClone(snapshot.catalog.models)
  let fetchedAt = snapshot.catalog.fetchedAt
  let catalogRows: unknown[] | null = null
  let priceRows: unknown[] | null = null
  let metadataAt = 0
  let pricesAt = 0
  let attemptedAt: number | null = null
  let warnings = ["Using the last verified provider snapshot."]
  const definitions = new Map<string, LiveModelDefinition>(
    Object.entries(snapshot.definitions)
  )
  const detailPending = new Map<string, Promise<LiveModelDefinition | null>>()
  let pending: Promise<LiveCatalog> | null = null
  async function restyleSupplement(): Promise<LiveModelDefinition | null> {
    const id = `hf:${RESTYLE_PATH}`
    const previous = definitions.get(id)
    if (
      previous &&
      !previous.stale &&
      now() - previous.fetchedAt < METADATA_TTL
    )
      return previous
    try {
      const response = await fetcher(
        `${BASE}/api/v2/app-models/${RESTYLE_PATH}/`,
        {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
          headers: { Accept: "application/json" },
        }
      )
      if (!response.ok) return null
      const body = await response.text()
      if (body.length > 2_000_000) return null
      const raw: unknown = JSON.parse(body)
      if (
        !isRecord(raw) ||
        raw.availability_state !== "available" ||
        raw.output_type !== "video"
      )
        return null
      const model = summary(raw, { title: "Genjutsu" }, RESTYLE_PATH, "video")
      const detail = normalizeLiveDefinition(model, raw, now())
      const properties = detail.inputSchema.properties
      if (
        !isRecord(properties) ||
        !isRecord(properties.preset_id) ||
        properties.preset_id.format !== "uuid" ||
        !isRecord(properties.video_url) ||
        properties.video_url.format !== "uri"
      )
        return null
      definitions.set(id, detail)
      return detail
    } catch {
      return null
    }
  }
  function state(): LiveCatalog {
    return structuredClone({
      models,
      fetchedAt,
      stale:
        !metadataAt ||
        !pricesAt ||
        now() - metadataAt >= METADATA_TTL ||
        now() - pricesAt >= PRICING_TTL ||
        warnings.length > 0,
      warnings,
    })
  }
  async function refresh(): Promise<LiveCatalog> {
    const time = now()
    const needCatalog = !catalogRows || time - metadataAt >= METADATA_TTL
    const needPrices = !priceRows || time - pricesAt >= PRICING_TTL
    if (!needCatalog && !needPrices) return state()
    // A short retry delay prevents an outage from producing one provider request per render.
    if (attemptedAt !== null && time - attemptedAt < 15_000) return state()
    attemptedAt = time
    const results = await Promise.allSettled([
      needCatalog
        ? fetchPublicPages(fetcher, CATALOG_PATH)
        : Promise.resolve(catalogRows!),
      needPrices
        ? fetchPublicPages(fetcher, PRICING_PATH)
        : Promise.resolve(priceRows!),
    ])
    const nextWarnings: string[] = []
    let nextCatalog = catalogRows
    let nextPrices = priceRows
    if (results[0].status === "fulfilled") nextCatalog = results[0].value
    else
      nextWarnings.push(
        "Provider model refresh failed. Showing last verified models."
      )
    if (results[1].status === "fulfilled") nextPrices = results[1].value
    else
      nextWarnings.push(
        "Provider pricing refresh failed. Published prices are stale."
      )
    try {
      // Require both validated feeds before replacing the known catalog.
      if (
        nextCatalog &&
        nextPrices &&
        results.every((result) => result.status === "fulfilled")
      ) {
        const nextModels = normalizeLiveCatalog(nextCatalog, nextPrices)
        if (
          !nextModels.some((model) => model.path === RESTYLE_PATH) &&
          nextModels.some((model) =>
            model.path.startsWith("higgsfield/genjutsu/")
          )
        ) {
          const restyle = await restyleSupplement()
          if (restyle) {
            nextModels.push({
              id: restyle.id,
              path: restyle.path,
              label: restyle.label,
              family: restyle.family,
              surface: restyle.surface,
              description: restyle.description,
              ...(restyle.previewImage
                ? { previewImage: restyle.previewImage }
                : {}),
            })
            nextModels.sort((a, b) => a.label.localeCompare(b.label))
          }
        }
        models = nextModels
        catalogRows = nextCatalog
        priceRows = nextPrices
        if (needCatalog) metadataAt = time
        if (needPrices) pricesAt = time
        fetchedAt = Math.min(metadataAt, pricesAt)
      } else if (!nextWarnings.length)
        nextWarnings.push("Provider catalog could not be verified.")
    } catch {
      nextWarnings.push(
        "Provider metadata changed unexpectedly. Showing last verified data."
      )
    }
    warnings = nextWarnings
    return state()
  }
  async function listLiveModels(): Promise<LiveCatalog> {
    if (!pending)
      pending = refresh().finally(() => {
        pending = null
      })
    return pending
  }
  async function getLiveModel(id: string): Promise<LiveModelDefinition | null> {
    const catalog = await listLiveModels()
    const model = catalog.models.find((candidate) => candidate.id === id)
    if (!model) return null
    const previous = definitions.get(id)
    if (
      previous &&
      !previous.stale &&
      now() - previous.fetchedAt < METADATA_TTL
    )
      return structuredClone({ ...previous, ...model, stale: catalog.stale })
    const existing = detailPending.get(id)
    if (existing) return existing
    const request = (async () => {
      try {
        const encoded = model.path.split("/").map(encodeURIComponent).join("/")
        const response = await fetcher(
          `${BASE}/api/v2/app-models/${encoded}/`,
          {
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
            headers: { Accept: "application/json" },
          }
        )
        if (!response.ok) throw new Error("Model details unavailable")
        const body = await response.text()
        if (body.length > 2_000_000)
          throw new Error("Model schema is too large")
        const definition = normalizeLiveDefinition(
          model,
          JSON.parse(body),
          now(),
          catalog.stale
        )
        definitions.set(id, definition)
        return structuredClone(definition)
      } catch {
        return previous
          ? structuredClone({ ...previous, ...model, stale: true })
          : null
      } finally {
        detailPending.delete(id)
      }
    })()
    detailPending.set(id, request)
    return request
  }
  async function getPublishedPricing(
    path: string
  ): Promise<PublishedPricing | null> {
    const catalog = await listLiveModels()
    if (catalog.stale) return null
    const model = catalog.models.find((entry) => entry.path === path)
    return model?.pricing ? structuredClone(model.pricing) : null
  }
  return { listLiveModels, getLiveModel, getPublishedPricing }
}
const client = createLiveCatalogClient()
export const listLiveModels = client.listLiveModels
export const getLiveModel = client.getLiveModel
export const getPublishedPricing = client.getPublishedPricing
