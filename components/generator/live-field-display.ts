import type { LiveModelDefinition } from "@/generation/catalog/live-types"
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

/** Read provider presentation hints without changing the generation schema. */
export function liveFieldDisplay(
  definition: LiveModelDefinition,
  key: string,
  raw: Record<string, unknown>,
  input: Record<string, unknown>
) {
  const ui = record(definition.uiSchema[key]) ? definition.uiSchema[key] : {}
  const options = record(ui["ui:options"]) ? ui["ui:options"] : {}
  const condition = record(options.visibleWhen) ? options.visibleWhen : null
  const visible =
    !condition ||
    typeof condition.field !== "string" ||
    !Object.hasOwn(condition, "equals") ||
    Object.is(
      input[condition.field] ?? definition.defaults[condition.field],
      condition.equals
    )
  let label =
    [ui["ui:title"], options.label, raw.title].find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0
    ) ?? key.replaceAll("_", " ")
  const path = definition.path
  if (
    /^kling-video\//.test(path) &&
    /image-to-video|first-last-frame/.test(path)
  ) {
    if (key === "image_url") label = "First frame"
    if (key === "last_image_url" || key === "end_image_url")
      label = "Last frame"
    if (key === "image_urls" && path === "kling-video/v4.0/image-to-video")
      label = "Middle frames"
  } else if (key === "image_urls") label = "Reference images"
  else if (key === "video_urls") label = "Reference videos"
  else if (key === "audio_urls") label = "Reference audio"
  return {
    label,
    hidden:
      ["hidden", "fullHidden"].includes(String(ui["ui:widget"])) || !visible,
    advanced: options.advanced === true,
  }
}
export function orderLiveFields(
  definition: LiveModelDefinition,
  properties: Record<string, unknown>
) {
  const entries = Object.entries(properties)
  const order = definition.uiSchema["ui:order"]
  if (!Array.isArray(order))
    return entries.sort(([a], [b]) =>
      a === "prompt" ? -1 : b === "prompt" ? 1 : 0
    )
  const keys = order.filter((key): key is string => typeof key === "string")
  const explicit = new Set(keys.filter((key) => key !== "*"))
  const remainder = entries.filter(([key]) => !explicit.has(key))
  const result: [string, unknown][] = []
  for (const key of keys) {
    if (key === "*") result.push(...remainder)
    else if (Object.hasOwn(properties, key)) result.push([key, properties[key]])
  }
  if (!keys.includes("*")) result.push(...remainder)
  return result
}

/** Errors from hidden controls must not block a different visible form. */
export function visibleFieldErrors(
  definition: LiveModelDefinition,
  input: Record<string, unknown>,
  properties: Record<string, unknown>,
  errors: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errors).filter(
      ([key]) =>
        record(properties[key]) &&
        !liveFieldDisplay(definition, key, properties[key], input).hidden
    )
  )
}
