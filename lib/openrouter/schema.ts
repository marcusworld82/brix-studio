import "server-only"
import Ajv from "ajv"
import addFormats from "ajv-formats"
import type { OpenRouterCapability } from "./types"
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
export function capabilitySchema(
  parameters: Record<string, OpenRouterCapability>,
  defaults: Record<string, unknown> = {}
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    prompt: { type: "string", minLength: 1, maxLength: 32000 },
  }
  const required = ["prompt"]
  for (const [key, descriptor] of Object.entries(parameters)) {
    if (
      [
        "__proto__",
        "constructor",
        "prototype",
        "model",
        "provider",
        "stream",
        "user",
      ].includes(key)
    )
      continue
    if (key === "input_references" && descriptor.type === "range") {
      properties[key] = {
        type: "array",
        minItems: descriptor.min,
        maxItems: Math.min(20, descriptor.max),
        items: {
          type: "object",
          required: ["type", "image_url"],
          properties: {
            type: { const: "image_url" },
            image_url: {
              type: "object",
              required: ["url"],
              properties: {
                url: {
                  type: "string",
                  format: "uri",
                  pattern: "^https://",
                  maxLength: 10000,
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      }
      if (descriptor.min > 0) required.push(key)
    } else if (descriptor.type === "enum") {
      const values = descriptor.values.filter(
        (value) =>
          key !== "output_format" || ["png", "jpeg", "webp"].includes(value)
      )
      if (values.length) properties[key] = { type: "string", enum: values }
    } else if (descriptor.type === "range")
      properties[key] = {
        type: "integer",
        minimum: descriptor.min,
        maximum: descriptor.max,
        ...(key === "n" ? { default: 1 } : {}),
      }
    else if (key === "seed")
      properties[key] = { type: "integer", minimum: 0, maximum: 2147483647 }
    else if (key === "size")
      properties[key] = {
        type: "string",
        pattern:
          "^(?:512|768|1K|1\\.5K|2K|4K|[1-9][0-9]{1,4}x[1-9][0-9]{1,4})$",
      }
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (record(properties[key]))
      properties[key] = { ...properties[key], default: structuredClone(value) }
  }
  return { type: "object", required, properties, additionalProperties: false }
}
export function validateOpenRouterInput(
  schema: Record<string, unknown>,
  raw: unknown
): { data: Record<string, unknown> | null; errors: string[] } {
  if (!record(raw))
    return { data: null, errors: ["Image input must be an object."] }
  try {
    const encoded = JSON.stringify(raw)
    if (encoded.length > 300_000) throw new Error("Input too large")
    const data = JSON.parse(encoded) as Record<string, unknown>
    const ajv = new Ajv({
      strict: false,
      allErrors: true,
      useDefaults: true,
      ownProperties: true,
    })
    addFormats(ajv)
    const validate = ajv.compile(schema)
    if (!validate(data))
      return {
        data: null,
        errors: (validate.errors ?? [])
          .slice(0, 10)
          .map((error) => `${error.instancePath || "Input"} ${error.message}`),
      }
    return { data, errors: [] }
  } catch {
    return {
      data: null,
      errors: ["Image input could not be validated safely."],
    }
  }
}
