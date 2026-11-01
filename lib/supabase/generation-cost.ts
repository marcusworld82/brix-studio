import "server-only"
import { EstimateDescriptionError } from "@/lib/higgsfield/client"
import { getPublishedPricing } from "@/lib/higgsfield/live-catalog"
import {
  publishedCost,
  publishedFormulaSupported,
} from "@/lib/higgsfield/published-cost"
import { probeMedia } from "@/lib/storage/probe"
import { createSupabaseServiceClient } from "./server"
import { MEDIA_BUCKET, pathFromMediaUrl } from "./media"
import type { MediaItem } from "@/generation/catalog/types"

type Metadata = ReturnType<typeof probeMedia>
// Metadata is scoped to the verified owner/path. No media bytes or credentials are retained.
const metadata = new Map<string, { at: number; value: Metadata }>()
async function readMetadata(
  userId: string,
  item: MediaItem & { path: string }
): Promise<Metadata> {
  if (item.kind !== "video") return {}
  pathFromMediaUrl(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/sign/${MEDIA_BUCKET}/${item.path}`,
    userId
  )
  const key = `${userId}:${item.path}`
  const old = metadata.get(key)
  if (old && Date.now() - old.at < 300_000) return old.value
  const service = createSupabaseServiceClient()
  const info = await service.storage.from(MEDIA_BUCKET).info(item.path)
  if (
    info.error ||
    !info.data ||
    typeof info.data.size !== "number" ||
    info.data.size > 50 * 1024 * 1024
  )
    return {}
  const file = await service.storage.from(MEDIA_BUCKET).download(item.path)
  if (file.error || !file.data || file.data.size > 50 * 1024 * 1024) return {}
  const value = probeMedia(
    Buffer.from(await file.data.arrayBuffer()),
    info.data.contentType ?? file.data.type
  )
  if (metadata.size >= 128) metadata.delete(metadata.keys().next().value!)
  metadata.set(key, { at: Date.now(), value })
  return value
}
export async function quoteGenerationCost(
  userId: string,
  client: {
    estimate: (
      path: string,
      body: Record<string, unknown>
    ) => Promise<{ usd: number; discountUsd?: number }>
  },
  request: { path: string; body: Record<string, unknown> },
  media: (MediaItem & { path: string })[]
) {
  try {
    const quote = await client.estimate(request.path, request.body)
    return {
      usd: quote.usd,
      estimated: false,
      source: "provider" as const,
      discountUsd: quote.discountUsd ?? 0,
      explanation: "Current authenticated Higgsfield API estimate.",
    }
  } catch (error) {
    if (!(error instanceof EstimateDescriptionError)) throw error
    if (!publishedFormulaSupported(request.path)) return null
    const [pricing, withMetadata] = await Promise.all([
      getPublishedPricing(request.path),
      Promise.all(
        media.map(async (item) => ({
          ...item,
          durationSec: undefined,
          ...(await readMetadata(userId, item)),
        }))
      ),
    ])
    return publishedCost(
      request.path,
      request.body,
      pricing,
      error.description,
      withMetadata
    )
  }
}
