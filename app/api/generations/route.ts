import { requireUser } from "@/lib/auth/session"
import { isSupabaseBackend } from "@/lib/backend"
import { listOwnGenerations } from "@/lib/supabase/library"
import { listGenerations } from "@/lib/generations/library"
import { errorResponse, json } from "@/lib/http"

/** GET /api/generations?surface=&projectId=&status=&cursor= — the caller's library. */
export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const params = new URL(request.url).searchParams
    if (isSupabaseBackend())
      return json(
        await listOwnGenerations(user.id, {
          surface: params.get("surface") ?? undefined,
          projectId: params.get("projectId") ?? undefined,
          status: params.get("status") ?? undefined,
          cursor: params.get("cursor") ?? undefined,
          limit: Number(params.get("limit") ?? "60"),
        })
      )
    return json(
      await listGenerations(user.objectId, {
        surface: (params.get("surface") ?? undefined) as
          "image" | "video" | "audio" | undefined,
        projectId: params.get("projectId") ?? undefined,
        status: (params.get("status") ?? "all") as
          "all" | "completed" | "failed",
        cursor: params.get("cursor") ?? undefined,
        limit: Number(params.get("limit") ?? "60"),
      })
    )
  } catch (caught) {
    return errorResponse(caught)
  }
}
