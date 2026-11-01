import "server-only"
import { getProviderModel } from "@/lib/providers/catalog"
import { validateLiveInput } from "@/generation/catalog/live-schema"
import { validateLiveShotTimeline } from "@/generation/catalog/shot-timeline"
import {
  effectiveLiveSchema,
  validateNativeMentions,
} from "@/generation/catalog/media-constraints"
import { groupMedia } from "@/generation/catalog/media-inputs"
import type { MediaItem, MediaRole } from "@/generation/catalog/types"
import { UserFacingError } from "@/lib/errors"
import { mediaKindFromMime } from "@/generation/upload-contract"
import { pathFromMediaUrl, signedMediaUrl, MEDIA_BUCKET } from "./media"
import { createSupabaseServiceClient } from "./server"

export async function prepareLiveUserGeneration(
  userId: string,
  input: { modelId: string; settings: Record<string, unknown>; prompt: string }
) {
  const definition = await getProviderModel(input.modelId)
  if (!definition)
    throw new UserFacingError("This model is not currently in the API catalog.")
  if (definition.stale)
    throw new UserFacingError(
      "The current model schema is unavailable. Refresh the catalog before generating."
    )
  const parsed = validateLiveInput(definition, input.settings.providerInput)
  if (!parsed.data)
    throw new UserFacingError(parsed.errors.join(" ").slice(0, 1500))
  const timelineErrors = validateLiveShotTimeline(definition, parsed.data)
  if (timelineErrors.length) throw new UserFacingError(timelineErrors.join(" "))
  // Additional properties can be valid API extensions, but undeclared quantity
  // aliases must never turn into trusted billing inputs for a source-length job.
  const properties = effectiveLiveSchema(definition, parsed.data).properties
  for (const field of [
    "duration",
    "duration_seconds",
    "seconds",
    "n",
    "num_images",
    "num_outputs",
    "batch_size",
  ]) {
    if (
      Object.hasOwn(parsed.data, field) &&
      (!properties ||
        typeof properties !== "object" ||
        !Object.hasOwn(properties, field))
    )
      throw new UserFacingError(
        `This model does not define the ${field} setting. Remove it and review the model inputs.`
      )
  }
  const mentionErrors = validateNativeMentions(definition, parsed.data)
  if (mentionErrors.length)
    throw new UserFacingError(mentionErrors.join(" ").slice(0, 1500))
  const media: (MediaItem & { path: string })[] = []
  const service = createSupabaseServiceClient()
  async function resolve(
    value: unknown,
    key = "",
    depth = 0
  ): Promise<unknown> {
    if (depth > 32)
      throw new UserFacingError("This input is too deeply nested.")
    if (Array.isArray(value))
      return Promise.all(value.map((v) => resolve(v, key, depth + 1)))
    if (value && typeof value === "object")
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value).map(async ([k, v]) => [
            k,
            await resolve(v, k, depth + 1),
          ])
        )
      )
    if (
      typeof value === "string" &&
      key !== "prompt" &&
      /^[a-z][a-z0-9+.-]*:/i.test(value)
    ) {
      const path = pathFromMediaUrl(value, userId)
      const { data, error } = await service.storage
        .from(MEDIA_BUCKET)
        .info(path)
      if (error || !data?.contentType)
        throw new UserFacingError("An input file is no longer available.")
      const kind = mediaKindFromMime(data.contentType)
      const role: MediaRole =
        kind === "video"
          ? key.endsWith("urls")
            ? "video"
            : "source"
          : kind === "audio"
            ? "audio"
            : /end|last/.test(key)
              ? "end"
              : key.endsWith("urls")
                ? "reference"
                : "start"
      const url = await signedMediaUrl(path, userId)
      media.push({ id: String(media.length), role, kind, url, path })
      return url
    }
    return value
  }
  const body = (await resolve(parsed.data)) as Record<string, unknown>
  const checked = validateLiveInput(definition, body)
  if (!checked.data)
    throw new UserFacingError(checked.errors.join(" ").slice(0, 1500))
  const prompt = typeof body.prompt === "string" ? body.prompt : input.prompt
  return {
    model: {
      id: definition.id,
      label: definition.label,
      surface: definition.surface,
    },
    media,
    plane: {
      model: definition.id,
      prompt: { text: prompt },
      inputMode: "text",
      media: groupMedia(media),
      settings: { ...body, aspectRatio: body.aspect_ratio ?? "16:9" },
    },
    request: { path: definition.path, body: checked.data },
  }
}
