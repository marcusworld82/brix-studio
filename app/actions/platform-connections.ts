"use server"
import { z } from "zod"
import { runAction } from "@/lib/action-result"
import { requireAdmin } from "@/lib/auth/session"
import { isSubscriptionEdition } from "@/lib/edition"
import { UserFacingError } from "@/lib/errors"
import {
  savePlatformConnection,
  platformConnectionStatus,
} from "@/lib/supabase/platform-connections"
const providerSchema = z.enum(["higgsfield", "openrouter"])
export async function savePlatformConnectionAction(raw: unknown) {
  return runAction(async () => {
    await requireAdmin()
    if (!isSubscriptionEdition())
      throw new UserFacingError(
        "Studio-funded keys are only available in the subscription edition."
      )
    const input = z
      .object({
        provider: providerSchema,
        apiKey: z.string().trim().min(1).max(4096),
      })
      .strict()
      .parse(raw)
    await savePlatformConnection(input.provider, input.apiKey)
    return platformConnectionStatus(input.provider)
  })
}
export async function disconnectPlatformConnectionAction(raw: unknown) {
  return runAction(async () => {
    await requireAdmin()
    if (!isSubscriptionEdition())
      throw new UserFacingError("This edition uses personal provider keys.")
    const provider = providerSchema.parse(raw)
    await savePlatformConnection(provider, null)
    return { connected: false }
  })
}
