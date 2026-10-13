import "server-only"

import type { Db } from "mongodb"

/**
 * Every index the app relies on. Idempotent: createIndex is a no-op when the
 * same index exists. Used by `pnpm db:init` and by the test harness.
 */
export async function ensureIndexes(database: Db): Promise<string[]> {
  const created: string[] = []
  const add = async (
    name: string,
    spec: Parameters<ReturnType<Db["collection"]>["createIndex"]>[0],
    options: Parameters<ReturnType<Db["collection"]>["createIndex"]>[1] = {}
  ) => {
    const [collection] = name.split(".")
    created.push(
      `${collection}.${await database
        .collection(collection!)
        .createIndex(spec, options)}`
    )
  }

  // Auth.js adapter collections.
  await add("users.email", { email: 1 }, { unique: true })
  await add(
    "users.stripe",
    { stripeCustomerId: 1 },
    { unique: true, sparse: true }
  )
  await add("users.grants", { nextGrantAt: 1 }, { sparse: true })
  await add(
    "accounts.provider",
    { provider: 1, providerAccountId: 1 },
    { unique: true }
  )
  await add("accounts.user", { userId: 1 })
  await add("sessions.token", { sessionToken: 1 }, { unique: true })
  await add("sessions.user", { userId: 1 })
  await add(
    "verification_tokens.token",
    { identifier: 1, token: 1 },
    { unique: true }
  )

  // Generations.
  await add("generations.feed", { userId: 1, createdAt: -1 })
  await add("generations.surface", { userId: 1, surface: 1, createdAt: -1 })
  await add("generations.project", { userId: 1, projectId: 1, createdAt: -1 })
  await add(
    "generations.request",
    { hfRequestId: 1 },
    { unique: true, sparse: true }
  )
  await add("generations.submit", { userId: 1, submitKey: 1 }, { unique: true })
  await add("generations.inflight", { status: 1, updatedAt: 1 })
  await add("generations.public", { isPublic: 1, publishedAt: -1 })

  await add("templates.official", { ownerId: 1, active: 1, order: 1 })
  await add("templates.owner", { ownerId: 1, createdAt: -1 })

  await add("projects.user", { userId: 1, updatedAt: -1 })
  await add("uploads.user", { userId: 1, createdAt: -1 })
  await add("uploads.url", { userId: 1, url: 1 })

  // Ledger: each grant/debit/refund applies once per bucket.
  await add(
    "credit_ledger.idem",
    { reason: 1, refType: 1, refId: 1, bucket: 1 },
    { unique: true }
  )
  await add("credit_ledger.user", { userId: 1, createdAt: -1 })

  await add(
    "hf_webhook_events.idem",
    { requestId: 1, status: 1 },
    { unique: true }
  )
  await add("presets.slug", { slug: 1 }, { unique: true })
  await add("presets.order", { active: 1, order: 1 })
  await add("model_pricing.model", { modelId: 1 }, { unique: true })
  await add("rate_limits.ttl", { expiresAt: 1 }, { expireAfterSeconds: 0 })
  await add("reports.generation", { generationId: 1 })
  await add("reports.status", { status: 1, createdAt: -1 })
  await add("dev_mailbox.to", { to: 1, createdAt: -1 })
  await add(
    "dev_mailbox.ttl",
    { createdAt: 1 },
    { expireAfterSeconds: 60 * 60 * 24 }
  )
  return created
}
