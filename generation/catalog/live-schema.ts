import "server-only"
import Ajv from "ajv"
import addFormats from "ajv-formats"
import type { LiveModelDefinition } from "./live-types"

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/** Only local JSON pointers are supported. No network fetch or remote schema resolution. */
function unsupportedReference(value: unknown, depth = 0): boolean {
  if (depth > 64) return true
  if (Array.isArray(value))
    return value.some((item) => unsupportedReference(item, depth + 1))
  if (!object(value)) return false
  return Object.entries(value).some(
    ([key, item]) =>
      key === "$dynamicRef" ||
      key === "$recursiveRef" ||
      (key === "$ref" &&
        (typeof item !== "string" || !item.startsWith("#/"))) ||
      unsupportedReference(item, depth + 1)
  )
}

function omitIncompatibleNullDefaults(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(omitIncompatibleNullDefaults)
    return
  }
  if (!object(value)) return
  const permitsNull =
    value.type === undefined ||
    value.type === "null" ||
    value.nullable === true ||
    (Array.isArray(value.type) && value.type.includes("null"))
  // Some provider schemas use null to mean an absent optional integer (SOUL seed).
  // Removing its default annotation preserves the actual integer validation rule.
  if (value.default === null && !permitsNull) delete value.default
  Object.values(value).forEach(omitIncompatibleNullDefaults)
}

export function validateLiveInput(
  definition: LiveModelDefinition,
  raw: unknown
): { data: Record<string, unknown> | null; errors: string[] } {
  if (!object(raw))
    return { data: null, errors: ["Model input must be an object."] }
  if (unsupportedReference(definition.inputSchema))
    return {
      data: null,
      errors: ["This model uses an unsupported schema reference."],
    }
  try {
    // JSON clone also prevents Ajv defaults from mutating the caller or cached definition.
    const encoded = JSON.stringify(raw)
    if (encoded.length > 1_000_000)
      return { data: null, errors: ["Model input is too large."] }
    const data: unknown = JSON.parse(encoded)
    if (!object(data))
      return { data: null, errors: ["Model input must be an object."] }
    const schema = structuredClone(definition.inputSchema)
    omitIncompatibleNullDefaults(schema)
    const ajv = new Ajv({
      strict: false,
      allErrors: true,
      useDefaults: true,
      coerceTypes: false,
      validateFormats: true,
      ownProperties: true,
    })
    addFormats(ajv)
    const validate = ajv.compile(schema)
    if (!validate(data))
      return {
        data: null,
        errors: (validate.errors ?? [])
          .slice(0, 20)
          .map(
            (error) =>
              `${error.instancePath || "Input"} ${error.message ?? "is invalid"}${error.keyword === "required" ? `: ${error.params.missingProperty}` : ""}`
          ),
      }
    return { data, errors: [] }
  } catch {
    return {
      data: null,
      errors: ["This model schema could not be validated safely."],
    }
  }
}
