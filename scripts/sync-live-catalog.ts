/** Public metadata only. Run: pnpm exec tsx --conditions=react-server scripts/sync-live-catalog.ts */
import { writeFile, rename } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { CATALOG_PATH, PRICING_PATH, fetchPublicPages, normalizeLiveCatalog, normalizeLiveDefinition } from "../lib/higgsfield/live-catalog"
import type { LiveCatalogSnapshot, LiveModelDefinition } from "../generation/catalog/live-types"

const fetcher = (url: string, init?: RequestInit) => fetch(url, init)
const [catalog, prices] = await Promise.all([fetchPublicPages(fetcher, CATALOG_PATH), fetchPublicPages(fetcher, PRICING_PATH)])
const models = normalizeLiveCatalog(catalog, prices)
const definitions: Record<string, LiveModelDefinition> = {}
const errors: string[] = []
let cursor = 0
// Detail downloads are limited to four. Normal application requests fetch only the selected model.
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < models.length) {
    const model = models[cursor++]
    try {
      const encoded = model.path.split("/").map(encodeURIComponent).join("/")
      const response = await fetcher(`https://dash.higgsfield.ai/api/v2/app-models/${encoded}/`, { redirect: "error", signal: AbortSignal.timeout(15_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.text()
      if (body.length > 2_000_000) throw new Error("Schema exceeds safety limit")
      definitions[model.id] = normalizeLiveDefinition(model, JSON.parse(body), Date.now())
    } catch { errors.push(model.id) }
  }
}))
if (errors.length) throw new Error(`Snapshot not replaced: ${errors.length} model schemas failed verification.`)
const snapshot: LiveCatalogSnapshot = { catalog: { models, fetchedAt: Date.now(), stale: false, warnings: [] }, definitions }
const destination = fileURLToPath(new URL("../lib/higgsfield/catalog.snapshot.json", import.meta.url))
const temporary = `${destination}.tmp`
await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`)
await rename(temporary, destination)
console.log(`Verified ${models.length} public model modes and schemas. Snapshot saved.`)
