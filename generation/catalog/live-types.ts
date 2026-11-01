/** Public provider metadata. Never contains account credentials or an executable URL. */
export interface PublishedPrice {
  amount: string
  original_amount?: string | null
  currency: string
  unit: string
  qualifier?: string
  discount_percentage?: number | null
  discount_expires_at?: string | null
  configuration?: Record<string, unknown>
  [key: string]: unknown
}
export interface PublishedPricing {
  primary: PublishedPrice
  options: PublishedPrice[]
  max_discount?: unknown
  [key: string]: unknown
}
export interface LiveModelSummary {
  id: string
  path: string
  label: string
  family: string
  surface: "image" | "video" | "audio"
  description: string
  previewImage?: string
  pricing?: PublishedPricing
}
export interface LiveModelDefinition extends LiveModelSummary {
  inputSchema: Record<string, unknown>
  uiSchema: Record<string, unknown>
  defaults: Record<string, unknown>
  pricingDescription: string | null
  fetchedAt: number
  stale: boolean
}
export interface LiveCatalog {
  models: LiveModelSummary[]
  fetchedAt: number
  stale: boolean
  warnings: string[]
}
export interface LiveCatalogSnapshot {
  catalog: LiveCatalog
  definitions: Record<string, LiveModelDefinition>
}
