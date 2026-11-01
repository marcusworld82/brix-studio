import { listProviderModels, getProviderModel } from "@/lib/providers/catalog"
import { json } from "@/lib/http"
/** Public provider metadata only. Private account prices use the authenticated estimate route. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")
  try {
    if (id) {
      const model = await getProviderModel(id)
      return model
        ? json({ model })
        : json({ error: "Model unavailable." }, 404)
    }
    return json(await listProviderModels())
  } catch {
    return json(
      { error: "The current catalog could not be loaded. Try again shortly." },
      503
    )
  }
}
