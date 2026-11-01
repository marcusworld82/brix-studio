import "server-only"
import { listLiveModels, getLiveModel } from "@/lib/higgsfield/live-catalog"
import {
  listOpenRouterModels,
  getOpenRouterModel,
} from "@/lib/openrouter/catalog"
import type {
  LiveCatalog,
  LiveModelDefinition,
} from "@/generation/catalog/live-types"
export async function listProviderModels(): Promise<LiveCatalog> {
  const [hf, or] = await Promise.all([listLiveModels(), listOpenRouterModels()])
  return {
    models: [
      ...hf.models,
      ...or.models.map((m) => ({
        id: m.id,
        path: m.path,
        label: m.label + " (OpenRouter)",
        family: m.family + " · OpenRouter",
        surface: m.surface,
        description: m.description,
      })),
    ],
    fetchedAt: Math.min(hf.fetchedAt, or.fetchedAt),
    stale: hf.stale || or.stale,
    warnings: [...hf.warnings, ...or.warnings],
  }
}
export async function getProviderModel(
  id: string
): Promise<LiveModelDefinition | null> {
  if (!id.startsWith("or:")) return getLiveModel(id)
  const model = await getOpenRouterModel(id)
  return model
    ? {
        ...model,
        label: model.label + " (OpenRouter)",
        uiSchema: {},
        pricingDescription: null,
      }
    : null
}
