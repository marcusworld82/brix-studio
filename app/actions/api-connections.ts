"use server"

import { runAction } from "@/lib/action-result"
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
    keyId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[^:\s]+$/),
    keySecret: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^[^:\s]+$/),
  })
  .strict()

export async function saveApiConnectionAction(input: unknown) {
  return runAction(async () => {
    const value = inputSchema.parse(input)
    await saveConnection(value.keyId, value.keySecret)
    return connectionStatus()
  })
}

export async function disconnectApiConnectionAction() {
  return runAction(async () => {
    await disconnectConnection()
    return { connected: false }
  })
}
