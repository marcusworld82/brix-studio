import { requireUser } from "@/lib/auth/session"
import { isSupabaseBackend } from "@/lib/backend"
import { estimateUserGeneration } from "@/lib/supabase/generations"
import { json, errorResponse, sameOrigin } from "@/lib/http"
export async function POST(request: Request) {
  if (!isSupabaseBackend()) return json({ error: "Not found" }, 404)
  if (!sameOrigin(request))
    return json({ error: "Cross-origin requests are not allowed." }, 403)
  try {
    const user = await requireUser()
    return json(await estimateUserGeneration(user.id, await request.json()))
  } catch (error) {
    return errorResponse(error)
  }
}
