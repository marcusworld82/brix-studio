"use server"

import { runAction } from "@/lib/action-result"
import { isSupabaseBackend } from "@/lib/backend"
import { finishUpload, removeUpload } from "@/lib/supabase/media"
import type { ActionResult } from "@/lib/action-types"
import { requireUser } from "@/lib/auth/session"
import type { UploadView } from "@/lib/generations/view"
import { deleteUpload, recordUpload } from "@/lib/uploads"

export async function recordUploadAction(input: {
  publicUrl: string
  contentType: string
  name: string
  size: number
  token: string
}): Promise<ActionResult<UploadView>> {
  return runAction(async () => {
    const user = await requireUser()
    return isSupabaseBackend()
      ? finishUpload(user.id, input)
      : recordUpload(user, input)
  })
}

export async function deleteUploadAction(
  id: string
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireUser()
    if (isSupabaseBackend()) await removeUpload(user.id, id)
    else await deleteUpload(user.objectId, id)
    return null
  })
}
