import "server-only"
import { UnauthorizedError, UserFacingError } from "@/lib/errors"
import {
  createOpenRouterClient,
  validOpenRouterApiKey,
} from "@/lib/openrouter/client"
import {
  encryptOpenRouterCredentials,
  decryptOpenRouterCredentials,
} from "@/lib/openrouter/credential-cipher"
import {
  createSupabaseServiceClient,
  createSupabaseSessionClient,
} from "./server"
type RpcResult<T> = Promise<{ data: T | null; error: unknown }>
type RpcName =
  | "brix_openrouter_put_connection"
  | "brix_openrouter_get_connection"
  | "brix_openrouter_disconnect_connection"
  | "brix_openrouter_connection_status"
function rpc<T>(name: RpcName, args: Record<string, unknown>): RpcResult<T> {
  const client = createSupabaseServiceClient()
  const call = client.rpc.bind(client) as unknown as (
    name: RpcName,
    args: Record<string, unknown>
  ) => RpcResult<T>
  return call(name, args)
}
function personalOnly() {
  if (process.env.BRIX_EDITION === "subscription")
    throw new UserFacingError(
      "Personal API connections are unavailable in this subscription edition."
    )
}
function secret() {
  const value = process.env.API_KEY_ENCRYPTION_SECRET
  if (!value) throw new Error("API connection encryption is not configured.")
  return value
}
async function signedInUser() {
  personalOnly()
  const client = await createSupabaseSessionClient()
  const { data, error } = await client.auth.getUser()
  if (error || !data.user?.email_confirmed_at) throw new UnauthorizedError()
  return data.user
}
export async function connectionStatus() {
  const user = await signedInUser()
  const { data, error } = await rpc<
    { key_label: string; created_at: string }[]
  >("brix_openrouter_connection_status", { target_user_id: user.id })
  if (error)
    throw new UserFacingError("Couldn't load your OpenRouter connection.")
  const row = data?.[0]
  return row
    ? { connected: true, label: row.key_label, savedAt: row.created_at }
    : { connected: false }
}
export async function saveConnection(apiKey: string): Promise<void> {
  const user = await signedInUser()
  const value = apiKey.trim()
  if (!validOpenRouterApiKey(value))
    throw new UserFacingError(
      "Paste the complete OpenRouter API key without spaces or headers."
    )
  const ciphertext = encryptOpenRouterCredentials(value, user.id, secret())
  const { error } = await rpc<string>("brix_openrouter_put_connection", {
    target_user_id: user.id,
    ciphertext,
    masked_label: `•••• ${value.slice(-4)}`,
  })
  if (error)
    throw new UserFacingError("Couldn't save your OpenRouter connection.")
}
export async function disconnectConnection(): Promise<void> {
  const user = await signedInUser()
  const { error } = await rpc<null>("brix_openrouter_disconnect_connection", {
    target_user_id: user.id,
  })
  if (error)
    throw new UserFacingError("Couldn't disconnect your OpenRouter key.")
}
export async function clientForOpenRouter(
  userId: string,
  connectionId?: string
) {
  personalOnly()
  const { data, error } = await rpc<
    { id: string; encrypted_credentials: string }[]
  >("brix_openrouter_get_connection", {
    target_user_id: userId,
    ...(connectionId ? { target_connection_id: connectionId } : {}),
  })
  if (error)
    throw new UserFacingError(
      "Couldn't load the OpenRouter connection for this generation."
    )
  const row = data?.[0]
  if (!row)
    throw new UserFacingError(
      "Connect your OpenRouter API key before generating.",
      "API_KEY_REQUIRED"
    )
  return {
    connectionId: row.id,
    client: createOpenRouterClient({
      apiKey: decryptOpenRouterCredentials(
        row.encrypted_credentials,
        userId,
        secret()
      ),
    }),
  }
}
