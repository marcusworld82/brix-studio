import "server-only"

import { collections } from "@/lib/db/collections"

/**
 * Fixed-window rate limiter on a Mongo TTL collection (no Redis needed).
 * The window key embeds the window start, so each window is one document
 * that expires on its own.
 */
export type RateLimitResult = { ok: boolean; remaining: number; resetAt: Date }

export class RateLimitError extends Error {
  readonly code = "RATE_LIMITED"
  constructor(
    message: string,
    readonly resetAt: Date
  ) {
    super(message)
    this.name = "RateLimitError"
  }
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000
  const start = Math.floor(Date.now() / windowMs) * windowMs
  const resetAt = new Date(start + windowMs)
  const { rateLimits } = await collections()
  const doc = await rateLimits.findOneAndUpdate(
    { _id: `${key}:${start}` },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: resetAt } },
    { upsert: true, returnDocument: "after" }
  )
  const count = doc?.count ?? 1
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt }
}

/** Throw a RateLimitError with a readable message when over the limit. */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  message = "Too many requests. Please wait a moment and try again."
): Promise<void> {
  const result = await rateLimit(key, limit, windowSeconds)
  if (!result.ok) throw new RateLimitError(message, result.resetAt)
}

/** Named limits used across the app. */
export const LIMITS = {
  magicLinkPerEmail: { limit: 5, window: 60 * 60 },
  magicLinkPerIp: { limit: 20, window: 60 * 60 },
  submitPerUser: { limit: 20, window: 60 },
  uploadPerUser: { limit: 60, window: 60 * 10 },
  statusPerUser: { limit: 120, window: 60 },
  templatePerUser: { limit: 30, window: 60 * 60 },
  reportPerUser: { limit: 10, window: 60 * 60 },
} as const
