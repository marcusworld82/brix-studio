"use server"

import { revalidatePath } from "next/cache"

import { runAction } from "@/lib/action-result"
import { isSupabaseBackend } from "@/lib/backend"
import { UserFacingError } from "@/lib/errors"
import {
  submitUserGeneration,
  cancelUserGeneration,
  finalizeUserGeneration,
} from "@/lib/supabase/generations"
import {
  ownGeneration,
  generationView,
  removeGenerations,
  moveGenerations,
} from "@/lib/supabase/library"
import type { ActionResult } from "@/lib/action-types"
import { objectIdOrNotFound, requireUser } from "@/lib/auth/session"
import { cancelGeneration } from "@/lib/generations/cancel"
import { finalizeGeneration } from "@/lib/generations/finalize"
import {
  deleteGenerations,
  getOwnGeneration,
  moveToProject,
  setPublished,
} from "@/lib/generations/library"
import { toGenerationView } from "@/lib/generations/serialize"
import { submitGeneration, type SubmitInput } from "@/lib/generations/submit"
import type { GenerationView } from "@/lib/generations/view"
import { IN_FLIGHT } from "@/lib/db/collections"
import { enforceRateLimit } from "@/lib/rate-limit"

export async function submitGenerationAction(
  input: SubmitInput
): Promise<ActionResult<GenerationView>> {
  return runAction(async () => {
    const user = await requireUser()
    return isSupabaseBackend()
      ? submitUserGeneration(user.id, input)
      : submitGeneration(user, input)
  })
}

export async function cancelGenerationAction(
  id: string
): Promise<ActionResult<GenerationView>> {
  return runAction(async () => {
    const user = await requireUser()
    if (isSupabaseBackend()) return cancelUserGeneration(user.id, id)
    await cancelGeneration(user.objectId, objectIdOrNotFound(id))
    return toGenerationView(await getOwnGeneration(user.objectId, id))
  })
}

/** User-triggered refresh for a run that seems stuck (asks the platform now). */
export async function refreshGenerationAction(
  id: string
): Promise<ActionResult<GenerationView>> {
  return runAction(async () => {
    const user = await requireUser()
    await enforceRateLimit(`refresh:${user.id}`, 30, 60)
    if (isSupabaseBackend()) {
      const row = await ownGeneration(user.id, id)
      await finalizeUserGeneration(row.id)
      return generationView(await ownGeneration(user.id, id))
    }
    const doc = await getOwnGeneration(user.objectId, id)
    if (IN_FLIGHT.includes(doc.status)) await finalizeGeneration(doc._id)
    return toGenerationView(await getOwnGeneration(user.objectId, id))
  })
}

export async function deleteGenerationsAction(
  ids: string[]
): Promise<ActionResult<{ deleted: number }>> {
  return runAction(async () => {
    const user = await requireUser()
    const result = isSupabaseBackend()
      ? await removeGenerations(user.id, ids)
      : await deleteGenerations(user.objectId, ids.slice(0, 200))
    revalidatePath("/assets")
    return result
  })
}

export async function publishGenerationAction(
  id: string,
  isPublic: boolean
): Promise<ActionResult<GenerationView>> {
  return runAction(async () => {
    const user = await requireUser()
    if (isSupabaseBackend())
      throw new UserFacingError(
        "Public publishing is not enabled on this studio."
      )
    const view = await setPublished(user.objectId, id, isPublic)
    return view
  })
}

export async function moveToProjectAction(
  ids: string[],
  projectId: string | null
): Promise<ActionResult<{ moved: number }>> {
  return runAction(async () => {
    const user = await requireUser()
    return isSupabaseBackend()
      ? moveGenerations(user.id, ids, projectId)
      : moveToProject(user.objectId, ids.slice(0, 200), projectId)
  })
}
