import "server-only"

import { UnauthorizedError, UserFacingError } from "@/lib/errors"
import { createHiggsfieldClient } from "@/lib/higgsfield/client"

import { decryptCredentials, encryptCredentials } from "./credential-cipher"
import {
  createSupabaseServiceClient,
  createSupabaseSessionClient,
} from "./server"

function cipherSecret(): string {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET
  if (!secret)
    throw new Error("BRIX API connection encryption is not configured.")
  return secret
}

async function signedInUser() {
  const client = await createSupabaseSessionClient()
  const { data, error } = await client.auth.getUser()
  if (error || !data.user?.email_confirmed_at) throw new UnauthorizedError()
  return { client, user: data.user }
}

/** A masked status only. Raw credentials never enter a client response. */
export async function connectionStatus() {
  const { user } = await signedInUser()
  const { data, error } = await createSupabaseServiceClient().rpc(
    "brix_user_connection_status",
    { target_user_id: user.id }
  )
  if (error) throw new UserFacingError("Couldn't load your API connection.")
  const row = data?.[0]
  return row
    ? { connected: true, label: row.key_label, savedAt: row.created_at }
    : { connected: false }
}

export async function saveConnection(
  keyId: string,
  keySecret: string
): Promise<void> {
  const { user } = await signedInUser()
  const credentials = `${keyId.trim()}:${keySecret.trim()}`
  if (
    !keyId.trim() ||
    !keySecret.trim() ||
    credentials.length > 512 ||
    !/^[^:\s]+:[^:\s]+$/.test(credentials)
  )
    throw new UserFacingError("Enter your Higgsfield API key ID and secret.")
  const ciphertext = encryptCredentials(credentials, user.id, cipherSecret())
  // No generation is submitted merely to save a key. Provider authentication
  // is checked when the first real operation is requested.
  const { error } = await createSupabaseServiceClient().rpc(
    "brix_put_connection",
    {
      target_user_id: user.id,
      ciphertext,
      masked_label: `•••• ${keyId.trim().slice(-4)}`,
    }
  )
  if (error)
    throw new UserFacingError("Couldn't save your API connection. Try again.")
}

export async function disconnectConnection(): Promise<void> {
  const { user } = await signedInUser()
  const { error } = await createSupabaseServiceClient().rpc(
    "brix_disconnect_connection",
    { target_user_id: user.id }
  )
  if (error) throw new UserFacingError("Couldn't disconnect your API key.")
}

/** Internal lifecycle helper. The user must be authenticated or loaded from a
 * trusted generation record. A pinned connection ID keeps in-flight work on
 * the account which submitted it. Never fall back to the owner's shared key.
 */
export async function clientForConnection(
  userId: string,
  connectionId?: string
) {
  const { data, error } = await createSupabaseServiceClient().rpc(
    "brix_get_connection",
    {
      target_user_id: userId,
      ...(connectionId ? { target_connection_id: connectionId } : {}),
    }
  )
  if (error)
    throw new UserFacingError(
      "Couldn't load the API connection for this generation."
    )
  const row = data?.[0]
  if (!row)
    throw new UserFacingError(
      "Connect your Higgsfield API key before generating.",
      "API_KEY_REQUIRED"
    )
  return {
    connectionId: row.id,
    client: createHiggsfieldClient({
      credentials: decryptCredentials(
        row.encrypted_credentials,
        userId,
        cipherSecret()
      ),
      baseUrl: "https://api.higgsfield.ai",
    }),
  }
}
