"use server"

import { runAction } from "@/lib/action-result"
import { isCompleteApiKey, MAX_API_KEY_LENGTH } from "@/lib/higgsfield/api-key"
import { z } from "zod"
import {
  connectionStatus,
  disconnectConnection,
  saveConnection,
} from "@/lib/supabase/connections"

// Authentication is performed inside each helper against Supabase Auth.
// Caller-supplied user IDs are intentionally not accepted.
export async function getApiConnectionAction() {
  return runAction(connectionStatus)
}

const inputSchema = z
  .object({
    apiKey: z
      .string()
      .trim()
      .min(1, "Paste your Higgsfield API key.")
      .max(MAX_API_KEY_LENGTH)
      .refine(
        isCompleteApiKey,
        "Paste the complete API key value without spaces or an Authorization header."
      ),
  })
  .strict()

export async function saveApiConnectionAction(input: unknown) {
  return runAction(async () => {
    const value = inputSchema.parse(input)
    await saveConnection(value.apiKey)
    return connectionStatus()
  })
}

export async function disconnectApiConnectionAction() {
  return runAction(async () => {
    await disconnectConnection()
    return { connected: false }
  })
}
