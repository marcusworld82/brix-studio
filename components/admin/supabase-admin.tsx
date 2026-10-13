import Link from "next/link"
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
  const tab = ["users", "generations", "presets", "templates"].includes(
    params.tab ?? ""
  )
    ? params.tab
    : "users"
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
      <nav className="flex gap-4" aria-label="Admin sections">
        {["users", "generations", "presets", "templates"].map((t) => (
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
