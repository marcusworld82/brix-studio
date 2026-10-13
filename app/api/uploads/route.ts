import { requireUser } from "@/lib/auth/session"
import { isSupabaseBackend } from "@/lib/backend"
import { ownUploads } from "@/lib/supabase/media"
import { errorResponse, json } from "@/lib/http"
import { listUploads } from "@/lib/uploads"

/** GET /api/uploads — the caller's uploads for the asset library. */
export async function GET() {
  try {
    const user = await requireUser()
    return json({
      items: await (isSupabaseBackend()
        ? ownUploads(user.id)
        : listUploads(user.objectId)),
    })
  } catch (caught) {
    return errorResponse(caught)
  }
}
