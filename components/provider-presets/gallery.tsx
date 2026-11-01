"use client"
import Link from "next/link"
import { useState } from "react"
import { Loader2, RefreshCw, Search } from "lucide-react"
import { useApp } from "@/components/providers/app-providers"
import type { ProviderPresetCatalog } from "@/lib/higgsfield/preset-types"
import { PROVIDER_PRESET_CATALOGS, PROVIDER_PRESET_GROUPS } from "./catalogs"
import { useProviderPresets } from "./use-provider-presets"
import { PresetGrid } from "./preset-grid"

export function ProviderPresetGallery({
  initialCatalog,
}: {
  initialCatalog: ProviderPresetCatalog
}) {
  const [catalog, setCatalog] = useState(initialCatalog),
    [search, setSearch] = useState("")
  const { openAuth } = useApp()
  const data = useProviderPresets(catalog)
  const config = PROVIDER_PRESET_CATALOGS[catalog]
  const visible = (data.page?.items ?? []).filter((item) =>
    `${item.name} ${item.description ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  return (
    <section
      aria-label="Provider preset galleries"
      className="min-w-0 space-y-5"
    >
      <div
        className="flex max-w-full gap-1 overflow-x-auto border-b border-white/10 pb-3"
        role="group"
        aria-label="Preset catalog"
      >
        {PROVIDER_PRESET_GROUPS.map((group) => (
          <button
            type="button"
            key={group}
            aria-pressed={catalog === group}
            onClick={() => {
              setCatalog(group)
              setSearch("")
            }}
            className={`min-h-11 shrink-0 rounded-lg px-4 text-sm ${catalog === group ? "bg-[#006494] text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
          >
            {PROVIDER_PRESET_CATALOGS[group].shortTitle}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-medium">{config.title}</h2>
          <p className="mt-1 text-sm text-white/50">{config.description}</p>
        </div>
        {data.access === "ready" && (
          <button
            type="button"
            onClick={data.refresh}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-white/60"
          >
            <RefreshCw className="size-3.5" />
            Refresh catalog
          </button>
        )}
      </div>
      {data.access !== "ready" ? (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-white/10 bg-white/[.03] p-6">
          <p className="text-sm text-white/65">
            {data.access === "signin"
              ? "Sign in to browse the presets available to your account."
              : "Connect your Higgsfield API key to load this catalog."}
          </p>
          {data.access === "signin" ? (
            <button
              type="button"
              onClick={() =>
                openAuth({
                  mode: "login",
                  reason: "Sign in to browse your provider presets.",
                })
              }
              className="min-h-11 rounded-lg bg-[#006494] px-5 text-sm text-white"
            >
              Sign in to browse
            </button>
          ) : (
            <Link
              href="/account"
              className="flex min-h-11 items-center rounded-lg bg-[#006494] px-5 text-sm text-white"
            >
              Connect Higgsfield API key
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-h-11 w-full max-w-md min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3">
              <Search className="size-4 shrink-0 text-white/40" />
              <input
                type="search"
                aria-label="Search provider presets"
                placeholder={`Search ${config.shortTitle.toLowerCase()}`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full min-w-0 bg-transparent py-2 text-sm outline-none"
              />
            </label>
            <p className="text-xs text-white/45">
              {data.page
                ? `${visible.length} of ${data.page.total} looks`
                : "Loading account catalog"}
            </p>
          </div>
          {data.status === "loading" && (
            <p
              className="flex items-center gap-2 text-xs text-white/50"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" />
              Checking current presets…
            </p>
          )}
          {data.error && (
            <div
              className="rounded-xl border border-amber-300/20 px-4 py-3 text-sm text-amber-100"
              role="status"
            >
              {data.error}
              <button
                type="button"
                onClick={data.refresh}
                className="ml-3 min-h-9 underline"
              >
                Retry
              </button>
            </div>
          )}
          {!!visible.length && (
            <PresetGrid
              items={visible}
              catalog={catalog}
              disabled={data.status !== "ready"}
            />
          )}
          {data.status === "ready" && !visible.length && (
            <p className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-white/50">
              {search
                ? "No looks match this search."
                : "No presets are available in this account catalog."}
            </p>
          )}
          <p className="text-xs leading-relaxed text-white/40">
            Provider previews are examples. Choosing a look opens the matching
            model. Add your own prompt and required image or video, then review
            the generation price.
          </p>
        </>
      )}
    </section>
  )
}
