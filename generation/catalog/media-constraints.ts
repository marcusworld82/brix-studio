import type { LiveModelDefinition } from "./live-types"

type Schema = Record<string, unknown>
type Definition = Pick<
  LiveModelDefinition,
  "inputSchema" | "uiSchema" | "defaults"
> &
  Partial<Pick<LiveModelDefinition, "id" | "path">>
/** Application safety limit, not a claim about any provider's asset allowance. */
export const LIVE_REFERENCE_APP_LIMIT = 60
export interface LiveMentionSyntax {
  prefix: "@image_" | "@video_"
  firstIndex: number
  sourceUrl: string
}
export interface LiveMediaField {
  key: string
  name: string
  kind: "image" | "video" | "audio"
  array: boolean
  minItems: number
  maxItems: number | null
  required: boolean
  encoding: "url" | "url-array" | "openrouter-image-references"
  mentionSyntax: LiveMentionSyntax | null
  description: string
  raw: Schema
}
export interface LiveNumericConstraint {
  key: string
  name: string
  type: "integer" | "number" | "numeric-string"
  minimum: number | null
  maximum: number | null
  enumValues: (number | string)[] | null
  required: boolean
  raw: Schema
}
function object(value: unknown): value is Schema {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
function own(value: Schema, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}
function label(key: string, schema: Schema, ui: Schema): string {
  const value = ui["ui:title"] ?? schema.title
  return typeof value === "string" ? value : key.replace(/_/g, " ")
}
function typeMatches(value: unknown, type: unknown): boolean {
  if (Array.isArray(type)) return type.some((item) => typeMatches(value, item))
  if (type === "null") return value === null
  if (type === "array") return Array.isArray(value)
  if (type === "object") return object(value)
  if (type === "integer")
    return typeof value === "number" && Number.isInteger(value)
  if (type === "number")
    return typeof value === "number" && Number.isFinite(value)
  return typeof value === type
}
/** A small, conservative condition evaluator for UI hints, never server validation. */
function matches(schema: Schema, value: unknown, depth = 0): boolean | null {
  if (depth > 20) return null
  let unknown = false
  for (const [key, condition] of Object.entries(schema)) {
    if (["title", "description", "default", "$comment"].includes(key)) continue
    if (key === "type") {
      if (!typeMatches(value, condition)) return false
    } else if (key === "const") {
      if (!equal(value, condition)) return false
    } else if (key === "enum" && Array.isArray(condition)) {
      if (!condition.some((item) => equal(item, value))) return false
    } else if (key === "required" && Array.isArray(condition)) {
      if (
        !object(value) ||
        condition.some((name) => typeof name !== "string" || !own(value, name))
      )
        return false
    } else if (key === "properties" && object(condition)) {
      if (!object(value)) continue
      for (const [name, nested] of Object.entries(condition)) {
        if (!own(value, name) || !object(nested)) continue
        const result = matches(nested, value[name], depth + 1)
        if (result === false) return false
        if (result === null) unknown = true
      }
    } else if (key === "not" && object(condition)) {
      const result = matches(condition, value, depth + 1)
      if (result === true) return false
      if (result === null) unknown = true
    } else if (
      (key === "allOf" || key === "anyOf") &&
      Array.isArray(condition)
    ) {
      const results = condition.map((entry) =>
        object(entry) ? matches(entry, value, depth + 1) : null
      )
      if (key === "allOf" && results.includes(false)) return false
      if (key === "anyOf" && results.every((result) => result === false))
        return false
      if (
        results.includes(null) &&
        !(key === "anyOf" && results.includes(true))
      )
        unknown = true
    } else if (key === "minItems" && typeof condition === "number") {
      if (Array.isArray(value) && value.length < condition) return false
    } else if (key === "maxItems" && typeof condition === "number") {
      if (Array.isArray(value) && value.length > condition) return false
    } else if (key === "minimum" && typeof condition === "number") {
      if (typeof value === "number" && value < condition) return false
    } else if (key === "maximum" && typeof condition === "number") {
      if (typeof value === "number" && value > condition) return false
    } else unknown = true
  }
  return unknown ? null : true
}
function merge(base: Schema, addition: Schema): Schema {
  const result = { ...base, ...addition }
  for (const key of ["minimum", "minItems", "minLength"])
    if (typeof base[key] === "number" && typeof addition[key] === "number")
      result[key] = Math.max(base[key], addition[key])
  for (const key of ["maximum", "maxItems", "maxLength"])
    if (typeof base[key] === "number" && typeof addition[key] === "number")
      result[key] = Math.min(base[key], addition[key])
  if (Array.isArray(base.required) || Array.isArray(addition.required))
    result.required = [
      ...new Set([
        ...(Array.isArray(base.required) ? base.required : []),
        ...(Array.isArray(addition.required) ? addition.required : []),
      ]),
    ]
  if (object(base.properties) || object(addition.properties)) {
    const properties: Schema = {
      ...(object(base.properties) ? base.properties : {}),
    }
    for (const [name, value] of Object.entries(
      object(addition.properties) ? addition.properties : {}
    ))
      properties[name] =
        object(value) && object(properties[name])
          ? merge(properties[name], value)
          : value
    result.properties = properties
  }
  return result
}
function expand(
  schema: Schema,
  value: unknown,
  root: Schema,
  depth = 0
): Schema {
  if (depth > 20) return { ...schema }
  let result = { ...schema }
  if (typeof schema.$ref === "string" && schema.$ref.startsWith("#/")) {
    let referenced: unknown = root
    for (const part of schema.$ref.slice(2).split("/"))
      referenced = object(referenced)
        ? referenced[part.replace(/~1/g, "/").replace(/~0/g, "~")]
        : undefined
    if (object(referenced))
      result = merge(expand(referenced, value, root, depth + 1), result)
  }
  if (Array.isArray(schema.allOf))
    for (const addition of schema.allOf)
      if (object(addition))
        result = merge(result, expand(addition, value, root, depth + 1))
  if (object(schema.if)) {
    const resultOfCondition = matches(schema.if, value)
    const branch =
      resultOfCondition === true
        ? schema.then
        : resultOfCondition === false
          ? schema.else
          : undefined
    if (object(branch))
      result = merge(result, expand(branch, value, root, depth + 1))
  }
  if (object(result.properties)) {
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([key, item]) => [
        key,
        object(item)
          ? expand(
              item,
              object(value) ? value[key] : undefined,
              root,
              depth + 1
            )
          : item,
      ])
    )
  }
  return result
}
/** Read-only effective constraints. Server-side Ajv remains the final authority. */
export function effectiveLiveSchema(
  definition: Definition,
  input: Record<string, unknown> = {}
): Schema {
  return expand(
    definition.inputSchema,
    { ...definition.defaults, ...input },
    definition.inputSchema
  )
}
function hasType(schema: Schema, type: string): boolean {
  return (
    schema.type === type ||
    (Array.isArray(schema.type) && schema.type.includes(type))
  )
}
function uri(schema: Schema): boolean {
  return (
    hasType(schema, "string") &&
    (schema.format === "uri" || schema.format === "url")
  )
}
function mediaKind(
  key: string,
  schema: Schema,
  ui: Schema
): LiveMediaField["kind"] | null {
  const evidence =
    `${key} ${schema.title ?? ""} ${ui["ui:title"] ?? ""} ${ui["ui:widget"] ?? ""}`.toLowerCase()
  if (/audio/.test(evidence)) return "audio"
  if (/video/.test(evidence)) return "video"
  if (/image|photo|frame/.test(evidence)) return "image"
  return null
}
/** Verified only for these exact API operations. Other providers get no invented syntax. */
function mentionSyntax(
  definition: Definition,
  key: string
): LiveMentionSyntax | null {
  const path = definition.path ?? definition.id?.replace(/^hf:/, "")
  if (
    path !== "kling-video/v4.0/reference-to-video" &&
    path !== "kling-video/v4.0/video-edit"
  )
    return null
  const sourceUrl = `https://open.higgsfield.ai/models/${path}/api-reference`
  if (key === "image_urls")
    return { prefix: "@image_", firstIndex: 1, sourceUrl }
  if (key === "video_urls")
    return {
      prefix: "@video_",
      firstIndex: path.endsWith("video-edit") ? 2 : 1,
      sourceUrl,
    }
  if (key === "video_url" && path.endsWith("video-edit"))
    return { prefix: "@video_", firstIndex: 1, sourceUrl }
  return null
}
export function liveMentionToken(
  field: LiveMediaField,
  indexZeroBased: number
): string | null {
  if (
    !field.mentionSyntax ||
    !Number.isInteger(indexZeroBased) ||
    indexZeroBased < 0 ||
    (field.maxItems !== null && indexZeroBased >= field.maxItems)
  )
    return null
  return `${field.mentionSyntax.prefix}${field.mentionSyntax.firstIndex + indexZeroBased}`
}
/** Keep documented index tokens bound to the same asset after remove/reorder.
 * Replacement is simultaneous, so swapping image1/image2 cannot cascade.
 */
export function remapLiveMentionTokens(
  prompt: string,
  field: LiveMediaField,
  previousUrls: string[],
  nextUrls: string[]
): string {
  if (!field.mentionSyntax || !previousUrls.length) return prompt
  const mapping = new Map<number, string>()
  const consumed = new Set<number>()
  for (const [oldIndex, url] of previousUrls.entries()) {
    const newIndex = nextUrls.findIndex(
      (candidate, index) => candidate === url && !consumed.has(index)
    )
    if (newIndex >= 0) consumed.add(newIndex)
    mapping.set(
      field.mentionSyntax.firstIndex + oldIndex,
      newIndex < 0 ? "" : (liveMentionToken(field, newIndex) ?? "")
    )
  }
  const pattern = new RegExp(`${field.mentionSyntax.prefix}(\\d+)\\b`, "g")
  return prompt.replace(
    pattern,
    (token: string, ordinal: string) => mapping.get(Number(ordinal)) ?? token
  )
}
export function liveMediaFields(
  definition: Definition,
  input: Record<string, unknown> = {}
): LiveMediaField[] {
  const schema = effectiveLiveSchema(definition, input)
  if (!object(schema.properties)) return []
  const required = Array.isArray(schema.required) ? schema.required : []
  const result: LiveMediaField[] = []
  for (const [key, raw] of Object.entries(schema.properties)) {
    if (!object(raw)) continue
    const ui = object(definition.uiSchema[key]) ? definition.uiSchema[key] : {}
    const isArray = hasType(raw, "array")
    let kind = mediaKind(key, raw, ui)
    let encoding: LiveMediaField["encoding"] | null = null
    if (uri(raw) && kind) encoding = "url"
    if (isArray && object(raw.items) && uri(raw.items) && kind)
      encoding = "url-array"
    if (
      key === "input_references" &&
      isArray &&
      object(raw.items) &&
      object(raw.items.properties) &&
      object(raw.items.properties.image_url)
    ) {
      kind = "image"
      encoding = "openrouter-image-references"
    }
    if (!kind || !encoding) continue
    result.push({
      key,
      name: label(key, raw, ui),
      kind,
      array: isArray,
      minItems: isArray
        ? typeof raw.minItems === "number"
          ? raw.minItems
          : 0
        : required.includes(key)
          ? 1
          : 0,
      maxItems: isArray
        ? typeof raw.maxItems === "number"
          ? raw.maxItems
          : null
        : 1,
      required: required.includes(key),
      encoding,
      mentionSyntax: mentionSyntax(definition, key),
      description: typeof raw.description === "string" ? raw.description : "",
      raw,
    })
  }
  return result
}
export function readLiveMediaUrls(
  field: LiveMediaField,
  value: unknown
): string[] {
  if (field.encoding === "url")
    return typeof value === "string" && value ? [value] : []
  if (!Array.isArray(value)) return []
  if (field.encoding === "url-array")
    return value.filter(
      (item): item is string => typeof item === "string" && item.length > 0
    )
  return value.flatMap((item) =>
    object(item) &&
    item.type === "image_url" &&
    object(item.image_url) &&
    typeof item.image_url.url === "string" &&
    item.image_url.url
      ? [item.image_url.url]
      : []
  )
}
export function encodeLiveMediaUrls(
  field: LiveMediaField,
  urls: string[]
): unknown {
  if (field.encoding === "url") return urls[0] ?? ""
  if (field.encoding === "url-array") return [...urls]
  return urls.map((url) => ({ type: "image_url", image_url: { url } }))
}
/** Reject dangling native tokens only for operations with documented syntax. */
export function validateNativeMentions(
  definition: Definition,
  input: Record<string, unknown>
): string[] {
  const fields = liveMediaFields(definition, input).filter(
    (field) => field.mentionSyntax !== null
  )
  if (!fields.length || typeof input.prompt !== "string") return []
  const allowed = new Set<string>()
  const prefixes = new Set<string>()
  for (const field of fields) {
    prefixes.add(field.mentionSyntax!.prefix)
    for (const [index] of readLiveMediaUrls(
      field,
      input[field.key]
    ).entries()) {
      const token = liveMentionToken(field, index)
      if (token) allowed.add(token)
    }
  }
  const errors = new Set<string>()
  for (const prefix of prefixes) {
    const pattern = new RegExp(`${prefix}(\\d+)\\b`, "g")
    for (const match of input.prompt.matchAll(pattern)) {
      if (!allowed.has(match[0]))
        errors.add(
          `${match[0]} has no attached reference. Add the file or remove this mention.`
        )
    }
  }
  return [...errors]
}
export function liveNumericConstraints(
  definition: Definition,
  input: Record<string, unknown> = {}
): LiveNumericConstraint[] {
  const schema = effectiveLiveSchema(definition, input)
  if (!object(schema.properties)) return []
  const required = Array.isArray(schema.required) ? schema.required : []
  return Object.entries(schema.properties).flatMap(([key, raw]) => {
    if (!object(raw)) return []
    const numeric = hasType(raw, "integer") || hasType(raw, "number")
    const numericString =
      hasType(raw, "string") &&
      Array.isArray(raw.enum) &&
      raw.enum.every(
        (value) =>
          typeof value === "string" &&
          value !== "" &&
          Number.isFinite(Number(value))
      )
    if (!numeric && !numericString) return []
    const ui = object(definition.uiSchema[key]) ? definition.uiSchema[key] : {}
    return [
      {
        key,
        name: label(key, raw, ui),
        type: hasType(raw, "integer")
          ? ("integer" as const)
          : numericString
            ? ("numeric-string" as const)
            : ("number" as const),
        minimum: typeof raw.minimum === "number" ? raw.minimum : null,
        maximum: typeof raw.maximum === "number" ? raw.maximum : null,
        enumValues:
          Array.isArray(raw.enum) &&
          raw.enum.every(
            (value) => typeof value === "string" || typeof value === "number"
          )
            ? raw.enum
            : null,
        required: required.includes(key),
        raw,
      },
    ]
  })
}
