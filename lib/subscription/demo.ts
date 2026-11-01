import { z } from "zod"

export const STORAGE_KEY = "brix.subscription.demo.v1"
export const modelSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  kind: z.enum(["image", "video"]),
  baseUsd: z.number().finite().min(0.001).max(1000),
  markupPercent: z.number().finite().min(0).max(1000),
})
const planSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(60),
  monthlyUsd: z.number().finite().min(0).max(10000),
  monthlyCredits: z.number().int().min(1).max(10000000),
})
const entrySchema = z.object({
  id: z.string().min(1).max(100),
  modelName: z.string().max(80),
  prompt: z.string().min(1).max(2000),
  createdAt: z.string().datetime(),
  credits: z.number().int().min(1).max(10000000),
  usd: z.number().finite().min(0).max(1000000),
  kind: z.enum(["image", "video"]),
})
const stateSchema = z
  .object({
    version: z.literal(1),
    creditsPerUsd: z.number().finite().min(1).max(10000),
    models: z.array(modelSchema).length(4),
    plans: z.array(planSchema).length(3),
    selectedPlanId: z.string(),
    history: z.array(entrySchema).max(200),
    displayName: z.string().trim().min(1).max(60),
    signedIn: z.boolean(),
  })
  .superRefine((state, ctx) => {
    if (!state.plans.some((plan) => plan.id === state.selectedPlanId))
      ctx.addIssue({ code: "custom", message: "Unknown plan" })
    if (
      new Set(state.models.map((m) => m.id)).size !== state.models.length ||
      new Set(state.plans.map((p) => p.id)).size !== state.plans.length ||
      new Set(state.history.map((h) => h.id)).size !== state.history.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate IDs" })
    if (
      !state.models.some((m) => m.kind === "image") ||
      !state.models.some((m) => m.kind === "video")
    )
      ctx.addIssue({ code: "custom", message: "Missing model category" })
  })
export type DemoState = z.infer<typeof stateSchema>
export type DemoModel = z.infer<typeof modelSchema>
export type DemoPlan = z.infer<typeof planSchema>
export type DemoEntry = z.infer<typeof entrySchema>

export function defaultDemoState(): DemoState {
  return {
    version: 1,
    creditsPerUsd: 100,
    selectedPlanId: "create",
    displayName: "Demo creator",
    signedIn: true,
    history: [],
    models: [
      {
        id: "image-fast",
        name: "Image / Fast",
        kind: "image",
        baseUsd: 0.04,
        markupPercent: 25,
      },
      {
        id: "image-detail",
        name: "Image / Detail",
        kind: "image",
        baseUsd: 0.08,
        markupPercent: 25,
      },
      {
        id: "video-fast",
        name: "Video / Fast",
        kind: "video",
        baseUsd: 0.12,
        markupPercent: 25,
      },
      {
        id: "video-detail",
        name: "Video / Detail",
        kind: "video",
        baseUsd: 0.24,
        markupPercent: 25,
      },
    ],
    plans: [
      { id: "explore", name: "Explore", monthlyUsd: 10, monthlyCredits: 800 },
      { id: "create", name: "Create", monthlyUsd: 25, monthlyCredits: 2400 },
      { id: "studio", name: "Studio", monthlyUsd: 60, monthlyCredits: 6000 },
    ],
  }
}

export function parseDemoState(input: unknown): DemoState | null {
  const result = stateSchema.safeParse(input)
  return result.success ? result.data : null
}
export function restoreDemoState(serialized: string | null): DemoState {
  try {
    return (
      parseDemoState(JSON.parse(serialized ?? "null")) ?? defaultDemoState()
    )
  } catch {
    return defaultDemoState()
  }
}
export function quoteDemo(
  model: DemoModel,
  creditsPerUsd: number,
  units: number
) {
  if (
    !modelSchema.safeParse(model).success ||
    !Number.isFinite(creditsPerUsd) ||
    creditsPerUsd < 1 ||
    creditsPerUsd > 10000 ||
    !Number.isInteger(units) ||
    units < 1 ||
    units > 40
  )
    throw new Error("Invalid demo quote inputs")
  // Charge whole credits, rounding up once after applying markup. Decimal
  // stabilization avoids an extra credit caused by binary float noise.
  const providerUsd = Number((model.baseUsd * units).toFixed(6))
  const draftUsd = Number(
    (providerUsd * (1 + model.markupPercent / 100)).toFixed(6)
  )
  const credits = Math.ceil(Number((draftUsd * creditsPerUsd).toFixed(6)))
  return { providerUsd, draftUsd, credits }
}
export function demoUsage(state: DemoState) {
  const allocation = state.plans.find(
    (plan) => plan.id === state.selectedPlanId
  )!.monthlyCredits
  const used = state.history.reduce((sum, entry) => sum + entry.credits, 0)
  return { allocation, used, remaining: Math.max(0, allocation - used) }
}
export function simulatePreview(
  state: DemoState,
  input: { modelId: string; prompt: string; units: number },
  id: string,
  now: string
): DemoState {
  const model = state.models.find((item) => item.id === input.modelId)
  const prompt = input.prompt.trim()
  if (!model || !prompt || prompt.length > 2000 || state.history.length >= 200)
    throw new Error("Add a prompt or reset the demo history before continuing.")
  const quote = quoteDemo(model, state.creditsPerUsd, input.units)
  if (quote.credits > demoUsage(state).remaining)
    throw new Error(
      "Not enough demo credits. Change the demo plan or reset the demo."
    )
  const next = parseDemoState({
    ...state,
    history: [
      {
        id,
        modelName: model.name,
        prompt,
        createdAt: now,
        credits: quote.credits,
        usd: quote.draftUsd,
        kind: model.kind,
      },
      ...state.history,
    ],
  })
  if (!next) throw new Error("Invalid preview. No demo credits were changed.")
  return next
}
