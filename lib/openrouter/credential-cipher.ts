import "server-only"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { validOpenRouterApiKey } from "./client"
function key(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret))
    throw new Error(
      "API_KEY_ENCRYPTION_SECRET must contain 32 bytes encoded as hex."
    )
  return Buffer.from(secret, "hex")
}
/** Same envelope as the existing credential cipher, separate authenticated domain. */
export function encryptOpenRouterCredentials(
  credentials: string,
  ownerId: string,
  secret: string
) {
  if (!ownerId || !validOpenRouterApiKey(credentials))
    throw new Error("An owner and complete OpenRouter API key are required.")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv)
  cipher.setAAD(Buffer.from(`brix:openrouter:v1:${ownerId}`))
  const ciphertext = Buffer.concat([
    cipher.update(credentials, "utf8"),
    cipher.final(),
  ])
  return [
    "v1",
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    ciphertext.toString("hex"),
  ].join(".")
}
export function decryptOpenRouterCredentials(
  encrypted: string,
  ownerId: string,
  secret: string
) {
  const parts = encrypted.split(".")
  if (
    !ownerId ||
    parts.length !== 4 ||
    parts[0] !== "v1" ||
    !/^[a-f0-9]{24}$/i.test(parts[1]!) ||
    !/^[a-f0-9]{32}$/i.test(parts[2]!) ||
    !/^(?:[a-f0-9]{2})+$/i.test(parts[3]!)
  )
    throw new Error("Invalid encrypted OpenRouter connection.")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(secret),
    Buffer.from(parts[1]!, "hex")
  )
  decipher.setAAD(Buffer.from(`brix:openrouter:v1:${ownerId}`))
  decipher.setAuthTag(Buffer.from(parts[2]!, "hex"))
  const credentials = Buffer.concat([
    decipher.update(Buffer.from(parts[3]!, "hex")),
    decipher.final(),
  ]).toString("utf8")
  if (!validOpenRouterApiKey(credentials))
    throw new Error("Invalid encrypted OpenRouter credentials.")
  return credentials
}
