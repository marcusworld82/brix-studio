"use server"

import { revalidatePath } from "next/cache"

import {
  adjustCredits,
  clearBillingFlag,
  moderate,
  setModelEnabled,
  setPriceOverride,
} from "@/lib/admin"
import { runAction } from "@/lib/action-result"
import type { ActionResult } from "@/lib/action-types"
import { requireAdmin } from "@/lib/auth/session"
import type { Credits } from "@/lib/db/collections"
import { deletePreset, upsertPreset, type PresetView } from "@/lib/presets"
import {
  deleteOfficialTemplate,
  upsertOfficialTemplate,
  type TemplateView,
} from "@/lib/templates"

export async function adjustCreditsAction(input: {
  userId: string
  bucket: "subscription" | "topup"
  delta: number
  note: string
}): Promise<ActionResult<{ balance: Credits }>> {
  return runAction(async () => adjustCredits(await requireAdmin(), input))
}

export async function clearBillingFlagAction(
  userId: string
): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin()
    await clearBillingFlag(userId)
    return null
  })
}

export async function setModelEnabledAction(
  modelId: string,
  enabled: boolean
): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin()
    await setModelEnabled(modelId, enabled)
    revalidatePath("/", "layout")
    return null
  })
}

export async function setPriceOverrideAction(input: {
  modelId: string
  path: string
  usd: number | null
  per?: "second" | "output" | "request"
}): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin()
    await setPriceOverride(input)
    return null
  })
}

export async function upsertPresetAction(
  input: Record<string, unknown>,
  id?: string
): Promise<ActionResult<PresetView>> {
  return runAction(async () => {
    await requireAdmin()
    const preset = await upsertPreset(input, id)
    revalidatePath("/effects")
    return preset
  })
}

export async function deletePresetAction(
  id: string
): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin()
    await deletePreset(id)
    revalidatePath("/effects")
    return null
  })
}

export async function upsertTemplateAction(
  input: Record<string, unknown>,
  id?: string
): Promise<ActionResult<TemplateView>> {
  return runAction(async () => {
    await requireAdmin()
    const template = await upsertOfficialTemplate(input, id)
    revalidatePath("/templates")
    return template
  })
}

export async function deleteTemplateAdminAction(
  id: string
): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin()
    await deleteOfficialTemplate(id)
    revalidatePath("/templates")
    return null
  })
}

export async function moderateAction(
  generationId: string,
  action: "unpublish" | "dismiss"
): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireAdmin()
    await moderate(generationId, action)
    return null
  })
}
