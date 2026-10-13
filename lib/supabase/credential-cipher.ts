import "server-only"

import { isCompleteApiKey } from "@/lib/higgsfield/api-key"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/** A dedicated server secret, not a publishable Supabase key. */
function encryptionKey(secret: string): Buffer {
  if (!/^[a-f0-9]{64}$/i.test(secret))
    throw new Error(
      "API_KEY_ENCRYPTION_SECRET must contain 32 random bytes encoded as hex."
    )
  return Buffer.from(secret, "hex")
}

/** Bind each encrypted value to its owner so records cannot be transplanted. */
export function encryptCredentials(
  credentials: string,
  ownerId: string,
  secret: string
): string {
  if (!ownerId || !isCompleteApiKey(credentials))
    throw new Error("An owner and complete Higgsfield API key are required.")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv)
  cipher.setAAD(Buffer.from(`brix:higgsfield:v1:${ownerId}`))
  const encrypted = Buffer.concat([
    cipher.update(credentials, "utf8"),
    cipher.final(),
  ])
  return [
    "v1",
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(".")
}

export function decryptCredentials(
  encrypted: string,
  ownerId: string,
  secret: string
): string {
  const parts = encrypted.split(".")
  if (
    !ownerId ||
    parts.length !== 4 ||
    parts[0] !== "v1" ||
    !/^[a-f0-9]{24}$/i.test(parts[1]!) ||
    !/^[a-f0-9]{32}$/i.test(parts[2]!) ||
    !/^(?:[a-f0-9]{2})+$/i.test(parts[3]!)
  )
    throw new Error("Invalid encrypted API connection.")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    Buffer.from(parts[1]!, "hex")
  )
  decipher.setAAD(Buffer.from(`brix:higgsfield:v1:${ownerId}`))
  decipher.setAuthTag(Buffer.from(parts[2]!, "hex"))
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3]!, "hex")),
    decipher.final(),
  ]).toString("utf8")
}
