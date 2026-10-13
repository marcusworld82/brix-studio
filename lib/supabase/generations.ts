import "server-only"
import { z } from "zod"
import { findModel, parseSettings } from "@/generation/catalog"
import { groupMedia, inferInputMode } from "@/generation/catalog/media-inputs"
import { mediaKindFromMime } from "@/generation/upload-contract"
import { toPlatform } from "@/generation/to-platform"
import { submitSchema } from "@/lib/generations/submit"
import {
  AmbiguousSubmitError,
  EstimateDescriptionError,
  PlatformError,
} from "@/lib/higgsfield/client"
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

export async function submitUserGeneration(userId: string, raw: unknown) {
  const input = submitSchema.parse(raw)
  await enforceRateLimit(`submit:${userId}`, 20, 60)
  const client = createSupabaseServiceClient()
  const { data: existing } = await client
    .from("brix_generations")
    .select()
    .eq("user_id", userId)
    .eq("submit_key", input.submitKey)
    .maybeSingle()
  if (existing) return generationView(existing)
  const model = findModel(input.modelId)
  if (!model) throw new UserFacingError("Unknown model.")
  const connection = await clientForConnection(userId)
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
  let estimate: number | null = null
  try {
    estimate = (await connection.client.estimate(request.path, request.body))
      .usd
  } catch (caught) {
    if (!(caught instanceof EstimateDescriptionError))
      throw new UserFacingError(providerMessage(caught))
  }
  const ratio = String(plane.settings.aspectRatio ?? "1:1")
    .split(":")
    .map(Number)
  const { data, error } = await client.rpc("brix_start_generation", {
    target_user_id: userId,
    target_connection_id: connection.connectionId,
    job: jsonValue({
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
      provider_cost_estimate: estimate,
      aspect: ratio[0] && ratio[1] ? ratio[0] / ratio[1] : 1,
      preset_id: input.presetId ?? null,
    }),
    request_body: jsonValue(request.body),
  })
  if (error)
    throw new UserFacingError(
      "Couldn't queue this generation. Check your connection or wait for active work to finish."
    )
  const queued = z.object({ id: z.uuid(), created: z.boolean() }).parse(data)
  if (!queued.created)
    return generationView(await ownGeneration(userId, queued.id))
  try {
    const result = await connection.client.submit(
      request.path,
      request.body,
      webhookUrlFor(queued.id)
    )
    const { error: saved } = await client
      .from("brix_generations")
      .update({
        provider_request_id: result.requestId,
        status: result.status === "in_progress" ? "in_progress" : "queued",
        updated_at: new Date().toISOString(),
      })
      .eq("id", queued.id)
      .eq("user_id", userId)
    if (saved) throw new AmbiguousSubmitError(saved)
  } catch (caught) {
    if (!(caught instanceof AmbiguousSubmitError))
      await client
        .from("brix_generations")
        .update({
          status: "failed",
          error: providerMessage(caught),
          error_kind: "submit",
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", queued.id)
        .eq("user_id", userId)
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
    const connection = await clientForConnection(row.user_id, row.connection_id)
    const status = await connection.client.status(row.provider_request_id)
    if (status.status === "completed") {
      if (!status.artifacts.length) {
        await commit({
          status: "failed",
          error:
            "Higgsfield finished without returning media. Check your API history.",
          finished_at: new Date().toISOString(),
        })
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
  const connection = await clientForConnection(userId, row.connection_id)
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
