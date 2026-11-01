import Link from "next/link"
import { isSubscriptionEdition } from "@/lib/edition"
import { SubscriptionPricingSettings } from "./subscription-pricing-settings"
import { ProviderKeyForm } from "@/components/account/provider-key-form"
import { platformConnectionStatus } from "@/lib/supabase/platform-connections"
import { AdminPresets, AdminTemplates } from "./admin-panels"
import { MODELS } from "@/generation/catalog"
import { listPresets } from "@/lib/presets"
import { listOfficialTemplates } from "@/lib/templates"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
export async function SupabaseAdmin({
  params,
}: {
  params: Record<string, string | undefined>
}) {
  const tabs = [
    "users",
    "generations",
    "presets",
    "templates",
    ...(isSubscriptionEdition() ? ["pricing", "providers"] : []),
  ]
  const tab = tabs.includes(params.tab ?? "") ? params.tab : "users"
  const models = MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    surface: m.surface,
  }))
  const client = createSupabaseServiceClient()
  const { data: profiles, error: profileError } =
    tab === "users"
      ? await client
          .from("brix_profiles")
          .select()
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: null, error: null }
  const { data: runs, error: runError } =
    tab === "generations"
      ? await client
          .from("brix_generations")
          .select("id,user_id,model_label,status,created_at")
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: null, error: null }
  if (profileError || runError) throw new Error("Couldn't load admin data.")
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl">Admin</h1>
      <nav
        className="flex max-w-full gap-4 overflow-x-auto pb-2"
        aria-label="Admin sections"
      >
        {tabs.map((t) => (
          <Link
            key={t}
            href={`/admin?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className="capitalize"
          >
            {t}
          </Link>
        ))}
      </nav>
      {tab === "pricing" ? <SubscriptionPricingSettings /> : null}
      {tab === "providers"
        ? await (async () => {
            const [hf, or] = await Promise.all([
              platformConnectionStatus("higgsfield").catch(() => ({
                connected: false,
                label: undefined,
                unavailable: true,
              })),
              platformConnectionStatus("openrouter").catch(() => ({
                connected: false,
                label: undefined,
                unavailable: true,
              })),
            ])
            return (
              <div className="flex flex-col gap-6">
                <ProviderKeyForm
                  platform
                  provider="higgsfield"
                  unavailable={"unavailable" in hf && hf.unavailable === true}
                  label={
                    hf.connected ? hf.label || "Configured securely" : undefined
                  }
                />
                <ProviderKeyForm
                  platform
                  provider="openrouter"
                  unavailable={"unavailable" in or && or.unavailable === true}
                  label={
                    or.connected ? or.label || "Configured securely" : undefined
                  }
                />
              </div>
            )
          })()
        : null}
      {tab === "users" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Account</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {profiles?.map((p) => (
                <tr key={p.id}>
                  <td className="py-3">{p.display_name || p.id}</td>
                  <td>{p.role}</td>
                  <td>{p.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {tab === "generations" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Model</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {runs?.map((r) => (
                <tr key={r.id}>
                  <td className="py-3">{r.model_label}</td>
                  <td>{r.status}</td>
                  <td>{r.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {tab === "presets" ? (
        <AdminPresets
          presets={await listPresets({ includeInactive: true })}
          models={models}
        />
      ) : null}
      {tab === "templates" ? (
        <AdminTemplates
          templates={await listOfficialTemplates({ includeInactive: true })}
          models={models}
        />
      ) : null}
    </div>
  )
}
