import "server-only"

import { ObjectId } from "mongodb"
import { z } from "zod"

import { findModel, parseSettings } from "@/generation/catalog"
import { groupMedia, inferInputMode } from "@/generation/catalog/media-inputs"
import type { GenerationPlane } from "@/generation/catalog/types"
import { toPlatform } from "@/generation/to-platform"
import { UserFacingError } from "@/lib/errors"
import type { SessionUser } from "@/lib/auth/session"
import { NotFoundError } from "@/lib/errors"
import {
  debitGeneration,
  isDuplicateKey,
  refundGeneration,
  withTransaction,
} from "@/lib/billing/ledger"
import { planOf } from "@/lib/billing/plans"
import {
  extraItems,
  factorFor,
  quoteRequest,
  usdForRequest,
} from "@/lib/billing/price"
import { pricingContext } from "@/lib/billing/pricing"
import {
  collections,
  IN_FLIGHT,
  type GenerationDoc,
} from "@/lib/db/collections"
import { env } from "@/lib/env"
import {
  AmbiguousSubmitError,
  higgsfield,
  PlatformError,
  PlatformNotConfiguredError,
} from "@/lib/higgsfield/client"
import { describePlatformError } from "@/lib/higgsfield/errors"
import { webhookUrlFor } from "@/lib/higgsfield/webhook"
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit"

import { resolveOwnedMedia } from "./media"
import { toGenerationView } from "./serialize"
import type { GenerationView } from "./view"

export const submitSchema = z.object({
  expectedUsd: z.number().finite().nonnegative().optional(),
  submitKey: z.uuid({ message: "Invalid submission." }),
  modelId: z.string().min(1).max(80),
  prompt: z.string().max(12_000, "That prompt is too long."),
  settings: z.record(z.string(), z.unknown()).default({}),
  media: z
    .array(
      z.object({
        role: z.enum(["start", "end", "reference", "video", "audio", "source"]),
        url: z.url().max(2048),
        name: z.string().max(200).optional(),
      })
    )
    .max(60)
    .default([]),
  projectId: z.string().nullish(),
  presetId: z.string().max(80).optional(),
})

export type SubmitInput = z.input<typeof submitSchema>

function aspectOf(settings: Record<string, unknown>): number {
  const raw = settings.aspectRatio ?? settings.aspect_ratio
  if (typeof raw !== "string") return 1
  const [w, h] = raw.split(/[:x/]/).map(Number)
  return w && h ? w / h : 1
}

/** Live estimate drift above this blocks the submit (margin would be unsafe). */
const BLOCK_DRIFT = 1.25
/** Any drift above this flags the model for repricing in admin. */
const FLAG_DRIFT = 1.01

/**
 * Compare the documented estimate endpoint with the USD basis our price was
 * computed from. Small drift flags admin; large drift refuses the submit.
 */
async function guardPrice(
  modelId: string,
  path: string,
  body: Record<string, unknown>,
  ourUsd: number
): Promise<void> {
  const value = env()
  if (!value.HF_PRICE_GUARD || !value.HF_CREDENTIALS) return
  let liveUsd: number
  try {
    liveUsd = (
      await Promise.race([
        higgsfield().estimate(path, body),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("estimate timeout")), 1_500)
        ),
      ])
    ).usd
  } catch {
    return // fail open: the table price stands
  }
  const { modelPricing } = await collections()
  if (liveUsd <= ourUsd * FLAG_DRIFT) {
    // Back in line (e.g. after `pnpm pricing:sync`): clear a stale flag.
    await modelPricing.updateOne(
      { modelId, "repriceNeeded.path": path },
      { $unset: { repriceNeeded: "" }, $set: { updatedAt: new Date() } }
    )
    return
  }
  await modelPricing.updateOne(
    { modelId },
    {
      $set: {
        repriceNeeded: { path, liveUsd, ourUsd, at: new Date() },
        updatedAt: new Date(),
      },
      $setOnInsert: { enabled: true },
    },
    { upsert: true }
  )
  console.error(
    `[pricing] live cost $${liveUsd} exceeds our price basis $${ourUsd} for ${path}`
  )
  if (liveUsd <= ourUsd * BLOCK_DRIFT) return
  throw new UserFacingError(
    "This setting is being repriced. Try again shortly or pick another model.",
    "REPRICING"
  )
}

export async function submitGeneration(
  user: SessionUser,
  raw: unknown
): Promise<GenerationView> {
  const input = submitSchema.parse(raw)
  await enforceRateLimit(
    `submit:${user.id}`,
    LIMITS.submitPerUser.limit,
    LIMITS.submitPerUser.window,
    "You're generating very fast. Wait a moment and try again."
  )
  const { generations, users, projects } = await collections()

  // Same Generate press twice (double click, retry, two tabs): one generation.
  const existing = await generations.findOne({
    userId: user.objectId,
    submitKey: input.submitKey,
  })
  if (existing) return toGenerationView(existing)

  const model = findModel(input.modelId)
  if (!model) throw new UserFacingError("Unknown model.", "UNKNOWN_MODEL")
  const pricing = await pricingContext()
  if (pricing.disabled.has(model.id))
    throw new UserFacingError(
      "This model is currently unavailable.",
      "MODEL_DISABLED"
    )

  const media = await resolveOwnedMedia(user.objectId, input.media)
  let plane: GenerationPlane
  let request: { path: string; body: Record<string, unknown> }
  try {
    plane = {
      model: model.id,
      inputMode: inferInputMode(model, media),
      prompt: { text: input.prompt.trim() },
      media: groupMedia(media),
      settings: parseSettings(model, input.settings),
    }
    // Paths and bodies come from the catalog, never from the client.
    request = toPlatform(plane)
  } catch (caught) {
    throw new UserFacingError(
      caught instanceof Error ? caught.message : "Invalid request.",
      "INVALID_INPUT"
    )
  }

  const usdRule = pricing.usd[request.path]
  if (!usdRule || !pricing.credits[request.path])
    throw new UserFacingError(
      "This option isn't available yet. Try another model or setting.",
      "UNPRICED"
    )
  const quote = quoteRequest(request, media, pricing.credits)
  const priceUsd = usdForRequest(usdRule, request, media, quote.units)
  await guardPrice(model.id, request.path, request.body, priceUsd)

  let projectId: ObjectId | null = null
  if (input.projectId) {
    if (!ObjectId.isValid(input.projectId))
      throw new NotFoundError("Project not found.")
    const project = await projects.findOne({
      _id: new ObjectId(input.projectId),
      userId: user.objectId,
    })
    if (!project) throw new NotFoundError("Project not found.")
    projectId = project._id
  }

  const generationId = new ObjectId()
  const now = new Date()
  const creditRule = pricing.credits[request.path]!
  const doc: GenerationDoc = {
    _id: generationId,
    userId: user.objectId,
    projectId,
    submitKey: input.submitKey,
    surface: model.surface,
    modelId: model.id,
    modelLabel: model.label,
    modelPath: request.path,
    requestBody: request.body,
    prompt: plane.prompt.text,
    settings: plane.settings,
    media: media.map(({ role, kind, displayUrl, name }) => ({
      role,
      kind,
      url: displayUrl,
      ...(name ? { name } : {}),
    })),
    status: "pending_submit",
    cost: quote.credits,
    costSplit: { subscription: 0, topup: 0 },
    refunded: 0,
    priceUsd,
    billing: {
      units: quote.units,
      provisional: quote.provisional,
      creditsPerUnit: creditRule.credits * factorFor(creditRule, request.body),
      unitScale: quote.unitScale,
      unitOffset: quote.unitOffset,
      extraCredits:
        (creditRule.perItem?.credits ?? 0) * extraItems(creditRule, media),
    },
    outputs: [],
    aspect: aspectOf(plane.settings),
    isPublic: false,
    ...(input.presetId ? { presetId: input.presetId } : {}),
    createdAt: now,
    updatedAt: now,
    finalizeAttempts: 0,
  }

  try {
    await withTransaction(async (session) => {
      const account = await users.findOne(
        { _id: user.objectId },
        { session, projection: { plan: 1 } }
      )
      const limit = planOf(account?.plan).concurrency[model.surface]
      const running = await generations.countDocuments(
        {
          userId: user.objectId,
          surface: model.surface,
          status: { $in: [...IN_FLIGHT] },
        },
        { session }
      )
      if (running >= limit)
        throw new UserFacingError(
          `Your plan runs ${limit} ${model.surface} generation${limit === 1 ? "" : "s"} at a time. Wait for one to finish or upgrade for more.`,
          "CONCURRENCY"
        )
      // The debit writes the user document, so concurrent submits for one
      // user conflict and serialize: balance and concurrency stay exact.
      doc.costSplit = await debitGeneration(
        user.objectId,
        generationId,
        doc.cost,
        session
      )
      await generations.insertOne(doc, { session })
    })
  } catch (caught) {
    if (isDuplicateKey(caught)) {
      const again = await generations.findOne({
        userId: user.objectId,
        submitKey: input.submitKey,
      })
      if (again) return toGenerationView(again)
    }
    throw caught
  }

  return toGenerationView(await sendToPlatform(doc))
}

/** Submit a pending generation. Definite failures refund; ambiguous ones wait for the reconciler. */
export async function sendToPlatform(
  doc: GenerationDoc
): Promise<GenerationDoc> {
  const { generations } = await collections()
  const id = doc._id
  try {
    const queued = await higgsfield().submit(
      doc.modelPath,
      doc.requestBody,
      webhookUrlFor(id.toHexString())
    )
    const status = queued.status === "in_progress" ? "in_progress" : "queued"
    const updated = await generations.findOneAndUpdate(
      { _id: id, status: "pending_submit" },
      {
        $set: {
          status,
          hfRequestId: queued.requestId,
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    )
    return updated ?? doc
  } catch (caught) {
    if (caught instanceof AmbiguousSubmitError) {
      console.warn(
        `[submit] ambiguous submit for ${id.toHexString()}; reconciler will resolve`
      )
      return doc
    }
    const described =
      caught instanceof PlatformNotConfiguredError
        ? { message: "Generation isn't configured on this server yet." }
        : describePlatformError(caught)
    if ("operatorAlert" in described && described.operatorAlert)
      console.error(`[submit] OPERATOR ALERT: ${described.operatorAlert}`)
    if (caught instanceof PlatformError)
      console.warn(
        `[submit] platform rejected ${doc.modelPath}: ${caught.status} ${caught.message}`
      )
    await generations.updateOne(
      { _id: id, status: "pending_submit" },
      {
        $set: {
          status: "failed",
          errorKind: "submit",
          error: `${described.message.replace(/\.?$/, ".")}${
            described.message.includes("refunded") ? "" : " Credits refunded."
          }`,
          finishedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    )
    await refundGeneration(id, "generation_refund")
    return (await generations.findOne({ _id: id })) ?? doc
  }
}
