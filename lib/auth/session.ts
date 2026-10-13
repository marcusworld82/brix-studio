import "server-only"

import { ObjectId } from "mongodb"

import { auth } from "@/auth"
import { isSupabaseBackend } from "@/lib/backend"
import {
  createSupabaseSessionClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server"
import type { Role } from "@/lib/db/collections"
import { NotFoundError, UnauthorizedError } from "@/lib/errors"

export { NotFoundError, UnauthorizedError }
export { objectIdOrNotFound } from "@/lib/ids"

export type SessionUser = {
  id: string
  objectId: ObjectId
  role: Role
  email: string
  name?: string | null
  image?: string | null
}

export async function currentUser(): Promise<SessionUser | null> {
  if (isSupabaseBackend()) {
    const client = await createSupabaseSessionClient()
    const { data, error } = await client.auth.getUser()
    if (error || !data.user?.email || !data.user.email_confirmed_at) return null
    const { data: profile } = await client
      .from("brix_profiles")
      .select("role, display_name")
      .eq("id", data.user.id)
      .single()
    const admin =
      profile?.role === "admin" ||
      (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .some(
          (email) =>
            email.trim().toLowerCase() === data.user!.email!.toLowerCase()
        )
    if (admin && profile?.role !== "admin")
      await createSupabaseServiceClient()
        .from("brix_profiles")
        .update({ role: "admin" })
        .eq("id", data.user.id)
    return {
      id: data.user.id,
      get objectId(): ObjectId {
        throw new Error(
          "Legacy database access is disabled for Supabase users."
        )
      },
      role: admin ? "admin" : "user",
      email: data.user.email,
      name: profile?.display_name,
    }
  }
  const session = await auth()
  const user = session?.user
  if (!user?.id || !ObjectId.isValid(user.id)) return null
  return {
    id: user.id,
    objectId: new ObjectId(user.id),
    role: user.role,
    email: user.email ?? "",
    name: user.name,
    image: user.image,
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser()
  if (!user) throw new UnauthorizedError()
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  // Non-admins get the same answer as a missing page.
  if (user.role !== "admin") throw new NotFoundError()
  return user
}
