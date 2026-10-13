import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { LibraryView } from "@/components/library/library-view"
import { currentUser } from "@/lib/auth/session"
import { listProjects } from "@/lib/generations/library"
import { isSupabaseBackend } from "@/lib/backend"
import { ownProjects } from "@/lib/supabase/library"

export const metadata: Metadata = { title: "Library" }

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const user = await currentUser()
  if (!user) redirect("/login?callbackUrl=/assets")
  const { tab } = await searchParams
  const projects = await (isSupabaseBackend()
    ? ownProjects(user.id)
    : listProjects(user.objectId))
  const filter =
    tab === "uploads" || tab === "image" || tab === "video" || tab === "audio"
      ? tab
      : "all"
  return <LibraryView initialProjects={projects} initialFilter={filter} />
}
