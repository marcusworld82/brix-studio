import "server-only"
import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { isSubscriptionEdition } from "@/lib/edition"
import { quoteOpenRouterInput } from "@/lib/openrouter/catalog"
import {
  OpenRouterError,
  AmbiguousOpenRouterError,
} from "@/lib/openrouter/client"
import { clientForOpenRouter } from "./openrouter-connections"
import {
  platformHiggsfieldClient,
  platformOpenRouterClient,
} from "./platform-connections"
import {
  quoteSubscriptionCost,
  startSubscriptionGeneration,
  settleSubscriptionGeneration,
} from "./subscription-billing"
import { prepareLiveUserGeneration } from "./live-input"
import { quoteGenerationCost } from "./generation-cost"
import { z } from "zod"
import { findModel, parseSettings } from "@/generation/catalog"
import { groupMedia, inferInputMode } from "@/generation/catalog/media-inputs"
import { mediaKindFromMime } from "@/generation/upload-contract"
import { toPlatform } from "@/generation/to-platform"
import { submitSchema } from "@/lib/generations/submit"
import { AmbiguousSubmitError, PlatformError } from "@/lib/higgsfield/client"
import { webhookUrlFor } from "@/lib/higgsfield/webhook"
import { enforceRateLimit } from "@/lib/rate-limit"
import { UserFacingError } from "@/lib/errors"
import { clientForConnection } from "./connections"
import { createSupabaseServiceClient } from "./server"
import { generationView, jsonValue, ownGeneration, uuid } from "./library"
import {
  MEDIA_BUCKET,
  pathFromMediaUrl,
  saveProviderOutput,
  signedMediaUrl,
} from "./media"

function providerMessage(error: unknown): string {
  if (error instanceof PlatformError) {
    if (error.status === 401)
      return "Higgsfield rejected this API key. Reconnect a valid API key in Account."
    if (error.status === 403)
      return "Higgsfield refused this request. Check your API balance and access."
    if (error.status === 429)
      return "Your Higgsfield account is busy. Wait a moment and try again."
    if (error.status === 400 || error.status === 422)
      return "Higgsfield rejected these settings or references. Check the model inputs."
  }
  return "Higgsfield couldn't complete this request. Try again later."
}

export async function prepareUserGeneration(
  userId: string,
  input: ReturnType<typeof submitSchema.parse>
) {
  if (input.modelId.startsWith("hf:") || input.modelId.startsWith("or:"))
    return prepareLiveUserGeneration(userId, input)
  const client = createSupabaseServiceClient()
  const model = findModel(input.modelId)
  if (!model) throw new UserFacingError("Unknown model.")
  const media = await Promise.all(
    input.media.map(async (m, index) => {
      const path = pathFromMediaUrl(m.url, userId)
      const { data, error } = await client.storage.from(MEDIA_BUCKET).info(path)
      if (error || !data?.contentType)
        throw new UserFacingError("A reference file is no longer available.")
      return {
        id: String(index),
        role: m.role,
        kind: mediaKindFromMime(data.contentType),
        url: await signedMediaUrl(path, userId),
        path,
        ...(m.name ? { name: m.name } : {}),
      }
    })
  )
  const plane = {
    model: model.id,
    inputMode: inferInputMode(model, media),
    prompt: { text: input.prompt.trim() },
    media: groupMedia(media),
    settings: parseSettings(model, input.settings),
  }
  let request: ReturnType<typeof toPlatform>
  try {
    request = toPlatform(plane)
  } catch {
    throw new UserFacingError(
      "Check the prompt, settings, and required references."
    )
  }
  return { model, media, plane, request }
}

type Prepared = Awaited<ReturnType<typeof prepareUserGeneration>>
type Input = ReturnType<typeof submitSchema.parse>
async function requestQuote(userId: string, input: Input, prepared: Prepared) {
  if (input.modelId.startsWith("or:")) {
    return quoteOpenRouterInput(input.modelId, prepared.request.body)
  }
  const connection = isSubscriptionEdition()
    ? await platformHiggsfieldClient()
    : await clientForConnection(userId)
  return quoteGenerationCost(
    userId,
    connection.client,
    prepared.request,
    prepared.media
  )
}
function usagePriceFingerprint(input: Input, result: unknown) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        model: input.modelId,
        settings: input.settings,
        prompt: input.prompt,
        quote: result,
      })
    )
    .digest("hex")
}
export async function estimateUserGeneration(userId: string, raw: unknown) {
  const input = submitSchema.parse(raw)
  await enforceRateLimit("estimate:" + userId, 120, 60)
  const prepared = await prepareUserGeneration(userId, input)
  try {
    const result = await requestQuote(userId, input, prepared)
    if (isSubscriptionEdition()) {
      const retail = await quoteSubscriptionCost(
        userId,
        input.modelId,
        result?.usd ?? null,
        prepared.request.body
      )
      return {
        status: "ready" as const,
        ...result,
        usd: retail.usd,
        credits: retail.credits,
        estimated: false,
        currency: "USD",
        explanation:
          "Studio credits for this generation, including the configured studio fee.",
        quotedAt: Date.now(),
      }
    }
    if (result?.usd != null)
      return {
        status: "ready" as const,
        ...result,
        currency: "USD",
        quotedAt: Date.now(),
      }
    return {
      status: "variable" as const,
      allowUsagePrice: input.modelId.startsWith("or:"),
      priceFingerprint: input.modelId.startsWith("or:")
        ? usagePriceFingerprint(input, result)
        : undefined,
      usd: null,
      currency: "USD",
      description:
        result?.explanation ??
        "A reliable price is unavailable for these inputs. Adjust the settings or use another model.",
      rates: result && "pricing" in result ? result.pricing : undefined,
    }
  } catch (caught) {
    if (caught instanceof UserFacingError) throw caught
    throw new UserFacingError(
      caught instanceof OpenRouterError
        ? caught.message
        : providerMessage(caught)
    )
  }
}
export async function submitUserGeneration(userId: string, raw: unknown) {
  const input = submitSchema.parse(raw)
  await enforceRateLimit("submit:" + userId, 20, 60)
  const service = createSupabaseServiceClient()
  const { data: existing } = await service
    .from("brix_generations")
    .select()
    .eq("user_id", userId)
    .eq("submit_key", input.submitKey)
    .maybeSingle()
  if (existing) return generationView(existing)
  const prepared = await prepareUserGeneration(userId, input)
  const { model, media, plane, request } = prepared
  const openRouter = input.modelId.startsWith("or:")
  const subscription = isSubscriptionEdition()
  const providerQuote = await requestQuote(userId, input, prepared)
  const providerUsd = providerQuote?.usd ?? null
  const retail = subscription
    ? await quoteSubscriptionCost(
        userId,
        input.modelId,
        providerUsd,
        request.body
      )
    : null
  const shownUsd = retail?.usd ?? providerUsd
  const usageAccepted =
    !subscription &&
    openRouter &&
    shownUsd === null &&
    input.acceptVariablePrice === true
  if (shownUsd === null && !usageAccepted)
    throw new UserFacingError(
      "A reliable generation price is unavailable for these inputs.",
      "PRICE_UNAVAILABLE"
    )
  if (
    usageAccepted &&
    input.expectedPriceFingerprint !==
      usagePriceFingerprint(input, providerQuote)
  )
    throw new UserFacingError(
      "The provider rates changed. Review the updated usage pricing.",
      "PRICE_CHANGED"
    )
  if (
    !usageAccepted &&
    (shownUsd === null ||
      input.expectedUsd === undefined ||
      Math.abs(input.expectedUsd - shownUsd) > 0.0000001 ||
      (retail && input.expectedCredits !== retail.credits))
  )
    throw new UserFacingError(
      "The price changed. Wait for the new quote and generate again.",
      "PRICE_CHANGED"
    )
  const ratio = String(plane.settings.aspectRatio ?? "1:1")
    .split(":")
    .map(Number)
  const job = {
    submit_key: input.submitKey,
    project_id: input.projectId ? uuid(input.projectId) : null,
    surface: model.surface,
    model_id: model.id,
    model_label: model.label,
    model_path: request.path,
    prompt: plane.prompt.text,
    settings: plane.settings,
    input_media: media.map((m) => ({
      role: m.role,
      kind: m.kind,
      path: m.path,
      ...(m.name ? { name: m.name } : {}),
    })),
    provider_cost_estimate: providerUsd,
    aspect: ratio[0] && ratio[1] ? ratio[0] / ratio[1] : 1,
    preset_id: input.presetId ?? null,
    provider: openRouter ? "openrouter" : "higgsfield",
  }
  const hf = !openRouter
    ? subscription
      ? await platformHiggsfieldClient()
      : await clientForConnection(userId)
    : null
  const or = openRouter
    ? subscription
      ? await platformOpenRouterClient()
      : await clientForOpenRouter(userId)
    : null
  let queued: { id: string; created: boolean }
  if (subscription && retail)
    queued = await startSubscriptionGeneration(
      userId,
      job,
      request.body,
      retail
    )
  else if (openRouter && or) {
    const client = service as unknown as SupabaseClient
    const { data, error } = await client.rpc(
      "brix_start_openrouter_generation",
      {
        target_user_id: userId,
        target_connection_id: or.connectionId,
        job: jsonValue(job),
        request_body: jsonValue(request.body),
      }
    )
    if (error)
      throw new UserFacingError(
        "Couldn't queue this image. Check your connection and active jobs."
      )
    queued = z.object({ id: z.uuid(), created: z.boolean() }).parse(data)
  } else {
    const { data, error } = await service.rpc("brix_start_generation", {
      target_user_id: userId,
      target_connection_id: hf!.connectionId!,
      job: jsonValue(job),
      request_body: jsonValue(request.body),
    })
    if (error)
      throw new UserFacingError(
        "Couldn't queue this generation. Check your connection and active jobs."
      )
    queued = z.object({ id: z.uuid(), created: z.boolean() }).parse(data)
  }
  if (!queued.created)
    return generationView(await ownGeneration(userId, queued.id))
  let providerStarted = false
  let providerCompleted = false
  try {
    if (subscription) {
      const pinned = (openRouter ? or : hf)?.connectionId
      if (pinned) {
        const saved = await service
          .from("brix_generations")
          .update({ platform_connection_id: pinned })
          .eq("id", queued.id)
          .eq("user_id", userId)
        if (saved.error)
          throw new UserFacingError(
            "Couldn't secure the provider connection. No generation was submitted."
          )
      }
    }
    if (openRouter && or) {
      providerStarted = true
      const result = await or.client.generateImage(input.modelId, request.body)
      const outputs = []
      for (const [index, file] of result.images.entries()) {
        const extension =
          file.contentType === "image/png"
            ? "png"
            : file.contentType === "image/jpeg"
              ? "jpg"
              : "webp"
        const path =
          userId + "/outputs/" + queued.id + "/" + index + "." + extension
        const stored = await service.storage
          .from(MEDIA_BUCKET)
          .upload(path, file.bytes, {
            contentType: file.contentType,
            upsert: false,
          })
        if (stored.error)
          throw new AmbiguousOpenRouterError(null, result.requestId)
        outputs.push({ kind: "image", path })
      }
      const saved = await service
        .from("brix_generations")
        .update({
          provider_request_id: result.requestId,
          status: "completed",
          outputs: jsonValue(outputs),
          provider_actual_cost: result.actualCostUsd,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", queued.id)
        .eq("user_id", userId)
      if (saved.error)
        throw new AmbiguousOpenRouterError(null, result.requestId)
      providerCompleted = true
      if (subscription)
        await settleSubscriptionGeneration(queued.id, "complete")
    } else {
      providerStarted = true
      const result = await hf!.client.submit(
        request.path,
        request.body,
        webhookUrlFor(queued.id)
      )
      const saved = await service
        .from("brix_generations")
        .update({
          provider_request_id: result.requestId,
          status: result.status === "in_progress" ? "in_progress" : "queued",
          updated_at: new Date().toISOString(),
        })
        .eq("id", queued.id)
        .eq("user_id", userId)
      if (saved.error) throw new AmbiguousSubmitError(saved.error)
    }
  } catch (caught) {
    if (providerCompleted) {
      await service
        .from("brix_generations")
        .update({
          error:
            "Your image is complete. Credit settlement will be reconciled.",
          error_kind: "billing_pending",
        })
        .eq("id", queued.id)
        .eq("user_id", userId)
      return generationView(await ownGeneration(userId, queued.id))
    }
    const uncertain =
      caught instanceof AmbiguousSubmitError ||
      caught instanceof AmbiguousOpenRouterError
    if (uncertain) {
      await service
        .from("brix_generations")
        .update({
          error:
            "The provider may have processed this request. It needs review before another submission. Check the provider usage history.",
          error_kind: "provider_review",
          ...(caught instanceof AmbiguousOpenRouterError && caught.requestId
            ? { provider_request_id: caught.requestId }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", queued.id)
        .eq("user_id", userId)
    } else {
      const saved = await service
        .from("brix_generations")
        .update({
          status: "failed",
          error:
            caught instanceof OpenRouterError
              ? caught.message
              : providerStarted
                ? providerMessage(caught)
                : "No request was submitted. Try again later.",
          error_kind: "submit",
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", queued.id)
        .eq("user_id", userId)
      if (subscription && !saved.error)
        await settleSubscriptionGeneration(queued.id, "failed")
    }
  }
  return generationView(await ownGeneration(userId, queued.id))
}

export async function finalizeUserGeneration(id: string) {
  const client = createSupabaseServiceClient()
  const { data, error } = await client.rpc("brix_claim_generation", {
    target_generation_id: uuid(id),
  })
  if (error) throw new Error("Couldn't claim generation refresh.")
  const row = data?.[0]
  if (!row) return
  if (row.provider === "openrouter") {
    await client
      .from("brix_generations")
      .update({ finalize_lease_until: null, finalize_lease_token: null })
      .eq("id", row.id)
      .eq("finalize_lease_token", row.finalize_lease_token!)
    return
  }
  const commit = async (
    values: Partial<import("./database").Tables<"brix_generations">>
  ) => {
    const result = await client
      .from("brix_generations")
      .update({
        ...values,
        finalize_lease_until: null,
        finalize_lease_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("finalize_lease_token", row.finalize_lease_token!)
    if (result.error) throw new Error("Couldn't persist generation status.")
  }
  try {
    if (!row.provider_request_id) {
      if (row.error_kind === "provider_review") {
        await commit({})
        return
      }
      if (Date.now() - Date.parse(row.created_at) > 120_000)
        await commit({
          status: "failed",
          error:
            "Higgsfield did not confirm the submission. Check your API history before retrying.",
          error_kind: "submit",
          finished_at: new Date().toISOString(),
        })
      else await commit({})
      return
    }
    const connection =
      row.billing_source === "subscription"
        ? await platformHiggsfieldClient(
            row.platform_connection_id ?? undefined
          )
        : await clientForConnection(row.user_id, row.connection_id ?? undefined)
    const status = await connection.client.status(row.provider_request_id)
    if (status.status === "completed") {
      if (!status.artifacts.length) {
        await commit({
          status: "failed",
          error:
            "Higgsfield finished without returning media. Check your API history.",
          finished_at: new Date().toISOString(),
        })
        if (row.billing_source === "subscription")
          await settleSubscriptionGeneration(row.id, "failed")
        return
      }
      let temporary = false
      const outputs = await Promise.all(
        status.artifacts.map(async (o, index) => {
          try {
            return {
              kind: o.kind,
              ...(await saveProviderOutput(o.url, row.user_id, row.id, index)),
            }
          } catch {
            temporary = true
            return { kind: o.kind, url: o.url }
          }
        })
      )
      await commit({
        status: "completed",
        outputs: jsonValue(outputs),
        finished_at: new Date().toISOString(),
        error: temporary
          ? "Generation finished, but Supabase could not save every file. Download it while the Higgsfield link is available."
          : null,
        error_kind: temporary ? "storage" : null,
      })
      if (row.billing_source === "subscription")
        await settleSubscriptionGeneration(row.id, "complete")
    } else if (["failed", "nsfw", "canceled"].includes(status.status)) {
      await commit({
        status: status.status,
        error:
          status.status === "nsfw"
            ? "Higgsfield blocked this generation under its content policy."
            : status.status === "failed"
              ? "Higgsfield reported that this generation failed. Check your API account for billing details."
              : null,
        finished_at: new Date().toISOString(),
      })
      if (row.billing_source === "subscription")
        await settleSubscriptionGeneration(row.id, "failed")
    } else
      await commit({
        status: status.status === "in_progress" ? "in_progress" : "queued",
      })
  } catch (caught) {
    await commit({ error: providerMessage(caught) })
  }
}

export async function cancelUserGeneration(userId: string, id: string) {
  const row = await ownGeneration(userId, id)
  if (row.status !== "queued" || !row.provider_request_id)
    throw new UserFacingError("Only queued generations can be canceled.")
  if (row.provider === "openrouter")
    throw new UserFacingError(
      "This provider cannot cancel an image once submitted."
    )
  const connection =
    row.billing_source === "subscription"
      ? await platformHiggsfieldClient(row.platform_connection_id ?? undefined)
      : await clientForConnection(userId, row.connection_id ?? undefined)
  try {
    await connection.client.cancel(row.provider_request_id)
  } catch (caught) {
    throw new UserFacingError(providerMessage(caught))
  }
  await finalizeUserGeneration(row.id)
  return generationView(await ownGeneration(userId, row.id))
}

export async function reconcileUserGenerations() {
  const { data, error } = await createSupabaseServiceClient()
    .from("brix_generations")
    .select("id")
    .in("status", ["pending_submit", "queued", "in_progress"])
    .order("updated_at")
    .limit(30)
  if (error) throw new Error("Couldn't load pending generations.")
  const results = await Promise.allSettled(
    (data ?? []).map((row) => finalizeUserGeneration(row.id))
  )
  return {
    checked: results.length,
    errors: results.filter((r) => r.status === "rejected").length,
  }
}
