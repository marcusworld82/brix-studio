import { requireUser } from "@/lib/auth/session"
import { after } from "next/server"
import { isSupabaseBackend } from "@/lib/backend"
import { ownStatuses } from "@/lib/supabase/library"
import { finalizeUserGeneration } from "@/lib/supabase/generations"
import { generationStatuses } from "@/lib/generations/library"
import { errorResponse, json } from "@/lib/http"
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit"

/**
 * GET /api/generations/status?ids=a,b,c — reads our database only (webhooks
 * and the reconciler move runs forward). Unknown or foreign ids are omitted.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser()
    await enforceRateLimit(
      `status:${user.id}`,
      LIMITS.statusPerUser.limit,
      LIMITS.statusPerUser.window
    )
    const ids = (new URL(request.url).searchParams.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 50)
    if (isSupabaseBackend()) {
      const items = await ownStatuses(user.id, ids)
      after(async () => {
        await Promise.allSettled(
          items
            .filter((item) =>
              ["pending_submit", "queued", "in_progress"].includes(item.status)
            )
            .map((item) => finalizeUserGeneration(item.id))
        )
      })
      return json({ items })
    }
    return json({ items: await generationStatuses(user.objectId, ids) })
  } catch (caught) {
    return errorResponse(caught)
  }
}
