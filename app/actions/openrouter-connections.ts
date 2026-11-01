"use server"
import { z } from "zod"
import { runAction } from "@/lib/action-result"
import { validOpenRouterApiKey } from "@/lib/openrouter/client"
import {
  connectionStatus,
  disconnectConnection,
  saveConnection,
} from "@/lib/supabase/openrouter-connections"
export async function getOpenRouterConnectionAction() {
  return runAction(connectionStatus)
}
const schema = z
  .object({
    apiKey: z
      .string()
      .trim()
      .min(8)
      .max(4096)
      .refine(
        validOpenRouterApiKey,
        "Paste the complete OpenRouter API key without spaces or headers."
      ),
  })
  .strict()
export async function saveOpenRouterConnectionAction(input: unknown) {
  return runAction(async () => {
    const value = schema.parse(input)
    await saveConnection(value.apiKey)
    return connectionStatus()
  })
}
export async function disconnectOpenRouterConnectionAction() {
  return runAction(async () => {
    await disconnectConnection()
    return { connected: false }
  })
}
