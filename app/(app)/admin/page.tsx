import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import {
  AdminGenerations,
  AdminModels,
  AdminModeration,
  AdminPresets,
  AdminTemplates,
  AdminUsers,
} from "@/components/admin/admin-panels"
import { MODELS } from "@/generation/catalog"
import {
  listAllGenerations,
  listModelAdmin,
  moderationQueue,
  searchUsers,
} from "@/lib/admin"
import { isSupabaseBackend } from "@/lib/backend"
import { SupabaseAdmin } from "@/components/admin/supabase-admin"
import { currentUser } from "@/lib/auth/session"
import { pricingContext } from "@/lib/billing/pricing"
import { listPresets } from "@/lib/presets"
import { listOfficialTemplates } from "@/lib/templates"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Admin", robots: { index: false } }

const TABS = [
  { id: "users", label: "Users" },
  { id: "generations", label: "Generations" },
  { id: "models", label: "Models & pricing" },
  { id: "presets", label: "Effects" },
  { id: "templates", label: "Templates" },
  { id: "moderation", label: "Moderation" },
] as const

type Tab = (typeof TABS)[number]["id"]

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await currentUser()
  if (!user) redirect("/login?callbackUrl=%2Fadmin")
  // Not an admin → the page simply doesn't exist.
  if (user?.role !== "admin") notFound()
  const params = await searchParams
  if (isSupabaseBackend()) return <SupabaseAdmin params={params} />
  const tab: Tab = TABS.some((t) => t.id === params.tab)
    ? (params.tab as Tab)
    : "users"

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-4xl">Admin</h1>
        <nav
          className="flex scrollbar-none gap-1 overflow-x-auto"
          aria-label="Admin sections"
        >
          {TABS.map((item) => (
            <Link
              key={item.id}
              href={`/admin?tab=${item.id}`}
              aria-current={tab === item.id ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-sm font-medium",
                tab === item.id
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {tab === "users" ? (
        <AdminUsers
          query={params.q ?? ""}
          rows={await searchUsers(params.q ?? "")}
        />
      ) : null}
      {tab === "generations" ? (
        <AdminGenerations
          status={params.status ?? "all"}
          modelId={params.model ?? ""}
          models={MODELS.map((model) => ({ id: model.id, label: model.label }))}
          page={await listAllGenerations({
            status: params.status,
            modelId: params.model,
            cursor: params.cursor,
          })}
        />
      ) : null}
      {tab === "models" ? (
        <AdminModels
          rows={await listModelAdmin()}
          placeholderCount={(await pricingContext()).placeholderPaths.length}
        />
      ) : null}
      {tab === "presets" ? (
        <AdminPresets
          presets={await listPresets({ includeInactive: true })}
          models={MODELS.map((model) => ({
            id: model.id,
            label: model.label,
            surface: model.surface,
          }))}
        />
      ) : null}
      {tab === "templates" ? (
        <AdminTemplates
          templates={await listOfficialTemplates({ includeInactive: true })}
          models={MODELS.map((model) => ({
            id: model.id,
            label: model.label,
            surface: model.surface,
          }))}
        />
      ) : null}
      {tab === "moderation" ? (
        <AdminModeration items={await moderationQueue()} />
      ) : null}
    </div>
  )
}
