"use server"

import { runAction } from "@/lib/action-result"
import { isSupabaseBackend } from "@/lib/backend"
import { ownProjects, newProject, changeProject } from "@/lib/supabase/library"
import type { ActionResult } from "@/lib/action-types"
import { requireUser } from "@/lib/auth/session"
import {
  createProject,
  deleteProject,
  listProjects,
  renameProject,
} from "@/lib/generations/library"
import type { ProjectView } from "@/lib/generations/view"

export async function listProjectsAction(): Promise<
  ActionResult<ProjectView[]>
> {
  return runAction(async () => {
    const user = await requireUser()
    return isSupabaseBackend()
      ? ownProjects(user.id)
      : listProjects(user.objectId)
  })
}

export async function createProjectAction(
  name: string
): Promise<ActionResult<ProjectView>> {
  return runAction(async () => {
    const user = await requireUser()
    return isSupabaseBackend()
      ? newProject(user.id, name)
      : createProject(user.objectId, name)
  })
}

export async function renameProjectAction(
  id: string,
  name: string
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireUser()
    if (isSupabaseBackend()) await changeProject(user.id, id, name)
    else await renameProject(user.objectId, id, name)
    return null
  })
}

export async function deleteProjectAction(
  id: string
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireUser()
    if (isSupabaseBackend()) await changeProject(user.id, id)
    else await deleteProject(user.objectId, id)
    return null
  })
}
