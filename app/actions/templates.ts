"use server"

import { revalidatePath } from "next/cache"

import { runAction } from "@/lib/action-result"
import type { ActionResult } from "@/lib/action-types"
import { requireUser } from "@/lib/auth/session"
import {
  createUserTemplate,
  deleteUserTemplate,
  type TemplateView,
} from "@/lib/templates"

export async function saveTemplateAction(
  input: Record<string, unknown>
): Promise<ActionResult<TemplateView>> {
  return runAction(async () => {
    const template = await createUserTemplate(await requireUser(), input)
    revalidatePath("/templates")
    return template
  })
}

export async function deleteTemplateAction(
  id: string
): Promise<ActionResult<null>> {
  return runAction(async () => {
    await deleteUserTemplate(await requireUser(), id)
    revalidatePath("/templates")
    return null
  })
}
