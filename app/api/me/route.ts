import { getBalance } from "@/lib/account"
import { currentUser } from "@/lib/auth/session"
import { isSupabaseBackend } from "@/lib/backend"
import { connectionStatus } from "@/lib/supabase/connections"
import { errorResponse, json } from "@/lib/http"

/** Live credit balance for the nav pill (balances are never kept in the session). */
export async function GET() {
  try {
    const user = await currentUser()
    if (!user) return json({ user: null })
    if (isSupabaseBackend())
      return json({
        user: { id: user.id, role: user.role },
        mode: "api-key",
        connection: await connectionStatus(),
      })
    const balance = await getBalance(user.objectId)
    return json({ user: { id: user.id, role: user.role }, ...balance })
  } catch (caught) {
    return errorResponse(caught)
  }
}
