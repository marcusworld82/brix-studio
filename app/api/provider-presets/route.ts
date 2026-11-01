import { requireUser } from "@/lib/auth/session"
import { UnauthorizedError } from "@/lib/errors"
import { isProviderPresetCatalog } from "@/lib/higgsfield/preset-types"
import { listUserProviderPresets } from "@/lib/higgsfield/presets"
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit"
const response = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const catalog = new URL(request.url).searchParams.get("catalog")
    if (!isProviderPresetCatalog(catalog))
      return response({ error: "Choose a valid preset catalog." }, 400)
    await enforceRateLimit(`provider-presets:${user.id}`, 60, 60)
    return response(await listUserProviderPresets(user.id, catalog))
  } catch (error) {
    if (error instanceof RateLimitError)
      return response(
        { error: "Too many preset requests. Please wait a moment." },
        429
      )
    if (error instanceof UnauthorizedError)
      return response({ error: "Sign in to load presets." }, 401)
    return response(
      {
        error:
          "Preset catalog could not be loaded. Check the provider connection and try again.",
      },
      503
    )
  }
}
