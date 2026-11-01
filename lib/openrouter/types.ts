export type OpenRouterCapability =
  | { type: "enum"; values: string[] }
  | { type: "range"; min: number; max: number }
  | { type: "boolean" }
export type OpenRouterPricingLine = {
  billable: string
  unit: "image" | "megapixel" | "token"
  cost_usd: number
  variant?: string
}
export type OpenRouterEndpoint = {
  providerName: string
  providerSlug: string
  providerTag: string | null
  supportedParameters: Record<string, OpenRouterCapability>
  inputSchema: Record<string, unknown>
  pricing: OpenRouterPricingLine[]
}
export type OpenRouterModel = {
  id: string
  path: string
  label: string
  family: string
  surface: "image"
  description: string
  inputSchema: Record<string, unknown>
  defaults: Record<string, unknown>
  supportedParameters: Record<string, OpenRouterCapability>
  endpoints: OpenRouterEndpoint[]
  fetchedAt: number
  stale: boolean
}
export type OpenRouterCatalog = {
  models: OpenRouterModel[]
  fetchedAt: number
  stale: boolean
  warnings: string[]
}
export type OpenRouterQuote = {
  outputUsd?: number
  outputUsdRange?: { min: number; max: number }
  outputTokens?: number
  inputCostComplete?: boolean
  usd: number | null
  estimated: boolean
  explanation: string
  providerTag: string | null
  pricing: OpenRouterPricingLine[]
}
export type OpenRouterImageResult = {
  requestId: string | null
  images: {
    bytes: Buffer
    contentType: "image/png" | "image/jpeg" | "image/webp"
  }[]
  actualCostUsd: number | null
}
