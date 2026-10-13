import { requireUser } from "@/lib/auth/session"
import { isSupabaseBackend } from "@/lib/backend"
import { prepareUpload } from "@/lib/supabase/media"
import { errorResponse, json, sameOrigin } from "@/lib/http"
import { createUploadTicket } from "@/lib/uploads"

/**
 * Signed reference-upload URL from the platform. The platform key never
 * leaves the server; the browser PUTs the file straight to the signed URL.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return json({ error: "Cross-origin upload requests are not allowed." }, 403)
  try {
    const user = await requireUser()
    const body: unknown = await request.json().catch(() => null)
    return json(
      await (isSupabaseBackend()
        ? prepareUpload(user.id, body)
        : createUploadTicket(user, body))
    )
  } catch (caught) {
    return errorResponse(caught)
  }
}
