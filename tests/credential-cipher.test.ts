import { describe, expect, it } from "vitest"
import {
  decryptCredentials,
  encryptCredentials,
} from "@/lib/supabase/credential-cipher"

const secret = "12".repeat(32)
const credentials = "example-key-id:example-key-secret"

describe("per-user API credential protection", () => {
  it("round trips without storing a readable API key", () => {
    const ciphertext = encryptCredentials(credentials, "owner", secret)
    expect(ciphertext).not.toContain(credentials)
    expect(decryptCredentials(ciphertext, "owner", secret)).toBe(credentials)
  })

  it("accepts a complete opaque API key without requiring separate parts", () => {
    const fullKey = "hf-complete-copied-key-example"
    expect(
      decryptCredentials(
        encryptCredentials(fullKey, "owner", secret),
        "owner",
        secret
      )
    ).toBe(fullKey)
  })

  it("uses a fresh nonce when encrypting the same credentials", () => {
    expect(encryptCredentials(credentials, "owner", secret)).not.toBe(
      encryptCredentials(credentials, "owner", secret)
    )
  })

  it("refuses to decrypt another user's connection", () => {
    const ciphertext = encryptCredentials(credentials, "owner", secret)
    expect(() => decryptCredentials(ciphertext, "intruder", secret)).toThrow()
  })

  it("rejects modified ciphertext and the wrong server secret", () => {
    const ciphertext = encryptCredentials(credentials, "owner", secret)
    const last = ciphertext.endsWith("00") ? "ff" : "00"
    expect(() =>
      decryptCredentials(ciphertext.slice(0, -2) + last, "owner", secret)
    ).toThrow()
    expect(() =>
      decryptCredentials(ciphertext, "owner", "34".repeat(32))
    ).toThrow()
  })

  it("rejects malformed versions, missing owners, and weak encryption secrets", () => {
    expect(() => decryptCredentials("v2.invalid", "owner", secret)).toThrow()
    expect(() => encryptCredentials(credentials, "", secret)).toThrow()
    expect(() =>
      encryptCredentials(credentials, "owner", "weak-secret")
    ).toThrow()
    expect(() =>
      encryptCredentials("bad\r\nAuthorization: injected", "owner", secret)
    ).toThrow()
  })
})
