import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServiceClient } from "./server"
import { encryptCredentials, decryptCredentials } from "./credential-cipher"
import {
  encryptOpenRouterCredentials,
  decryptOpenRouterCredentials,
} from "@/lib/openrouter/credential-cipher"
import { isCompleteApiKey } from "@/lib/higgsfield/api-key"
import { createHiggsfieldClient } from "@/lib/higgsfield/client"
import {
  createOpenRouterClient,
  validOpenRouterApiKey,
} from "@/lib/openrouter/client"
import { UserFacingError } from "@/lib/errors"
export type Provider = "higgsfield" | "openrouter"
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await (
    createSupabaseServiceClient() as unknown as SupabaseClient
  ).rpc(name, args)
  if (error)
    throw new UserFacingError(
      "Provider connection settings could not be loaded."
    )
  return data
}
function secret() {
  const value = process.env.API_KEY_ENCRYPTION_SECRET
  if (!value) throw new Error("Provider encryption is not configured.")
  return value
}
export async function savePlatformConnection(
  provider: Provider,
  key: string | null
) {
  const valid =
    key === null ||
    (provider === "higgsfield"
      ? isCompleteApiKey(key)
      : validOpenRouterApiKey(key))
  if (!valid) throw new UserFacingError("Paste the complete provider API key.")
  const encrypted =
    key === null
      ? null
      : provider === "higgsfield"
        ? encryptCredentials(key, "platform:higgsfield", secret())
        : encryptOpenRouterCredentials(key, "platform:openrouter", secret())
  await rpc("brix_put_platform_connection", {
    target_provider: provider,
    ciphertext: encrypted,
    masked_label: key ? "•••• " + key.slice(-4) : "",
  })
}
async function platformKey(provider: Provider, pinned?: string) {
  const rows = (await rpc("brix_platform_connection", {
    target_provider: provider,
    pinned_id: pinned ?? null,
  })) as { id: string; encrypted_credentials: string; key_label: string }[]
  const row = rows?.[0]
  if (row)
    return {
      connectionId: row.id,
      key:
        provider === "higgsfield"
          ? decryptCredentials(
              row.encrypted_credentials,
              "platform:higgsfield",
              secret()
            )
          : decryptOpenRouterCredentials(
              row.encrypted_credentials,
              "platform:openrouter",
              secret()
            ),
    }
  if (pinned)
    throw new UserFacingError(
      "The original studio provider connection is unavailable."
    )
  throw new UserFacingError(
    "Connect the studio provider key in Admin before generating.",
    "PROVIDER_NOT_CONFIGURED"
  )
}
export async function platformConnectionStatus(provider: Provider) {
  const rows = (await rpc("brix_platform_connection", {
    target_provider: provider,
    pinned_id: null,
  })) as { id: string; key_label: string }[]
  if (rows?.[0]) return { connected: true, label: rows[0].key_label }
  return { connected: false, label: undefined }
}
export async function platformHiggsfieldClient(pinned?: string) {
  const { key, connectionId } = await platformKey("higgsfield", pinned)
  return {
    connectionId,
    client: createHiggsfieldClient({
      credentials: key,
      baseUrl: "https://api.higgsfield.ai",
    }),
  }
}
export async function platformOpenRouterClient(pinned?: string) {
  const { key, connectionId } = await platformKey("openrouter", pinned)
  return { connectionId, client: createOpenRouterClient({ apiKey: key }) }
}
