"use client"
import Link from "next/link"
import { useState } from "react"
import { ImageIcon, Search, Loader2, RefreshCw, X } from "lucide-react"
import { useApp } from "@/components/providers/app-providers"
import { PromptBox } from "@/components/studio/prompt-box"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog"
import type {
  ProviderPreset,
  ProviderPresetCatalog,
} from "@/lib/higgsfield/preset-types"
import type { ProviderPresetState } from "./use-provider-presets"
import { PROVIDER_PRESET_CATALOGS } from "./catalogs"
import { PresetGrid } from "./preset-grid"

export function ProviderPresetPicker({
  catalog,
  data,
  value,
  onSelect,
  onClear,
}: {
  catalog: ProviderPresetCatalog
  data: ProviderPresetState
  value?: string
  onSelect: (preset: ProviderPreset) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("")
  const { openAuth } = useApp()
  const config = PROVIDER_PRESET_CATALOGS[catalog]
  const selected = data.page?.items.find((item) => item.id === value)
  const items = (data.page?.items ?? []).filter((item) =>
    `${item.name} ${item.description ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) {
            setSearch("")
            data.refresh()
          }
        }}
      >
        <DialogTrigger
          render={
            <PromptBox.Pill
              start={<ImageIcon />}
              className="max-w-[240px]"
              aria-label={`${config.pickerLabel}: ${selected?.name ?? "Choose"}`}
            >
              <span className="truncate">
                {selected?.name ?? `Choose ${config.pickerLabel.toLowerCase()}`}
              </span>
            </PromptBox.Pill>
          }
        />
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{config.title}</DialogTitle>
            <DialogDescription>
              Choose a verified look from your connected account. This does not
              start generation.
            </DialogDescription>
          </DialogHeader>
          {data.access !== "ready" ? (
            <div className="space-y-4 p-4 text-sm text-white/65">
              <p>
                {data.access === "signin"
                  ? "Sign in to browse your provider presets."
                  : "Connect your Higgsfield API key to load these presets."}
              </p>
              {data.access === "signin" ? (
                <button
                  type="button"
                  className="min-h-11 rounded-lg bg-[#006494] px-4 text-white"
                  onClick={() => {
                    setOpen(false)
                    openAuth({
                      mode: "login",
                      reason: "Sign in to choose a provider preset.",
                    })
                  }}
                >
                  Sign in to choose
                </button>
              ) : (
                <Link
                  href="/account"
                  className="inline-flex min-h-11 items-center rounded-lg bg-[#006494] px-4 text-white"
                >
                  Connect Higgsfield API key
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 px-3">
                  <Search className="size-4 shrink-0 text-white/40" />
                  <input
                    type="search"
                    aria-label="Search preset picker"
                    placeholder="Search looks"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="w-full min-w-0 bg-transparent text-sm outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={data.refresh}
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/5"
                  aria-label="Refresh preset catalog"
                >
                  <RefreshCw className="size-4" />
                </button>
              </div>
              {data.status === "loading" && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-xs text-white/50"
                >
                  <Loader2 className="size-4 animate-spin" />
                  Verifying current catalog…
                </p>
              )}
              {data.error && (
                <p role="status" className="text-sm text-amber-200">
                  {data.error}
                </p>
              )}
              <DialogBody>
                <div className="max-h-[58dvh] overflow-y-auto pr-1">
                  <PresetGrid
                    items={items}
                    catalog={catalog}
                    selectedId={value}
                    disabled={data.status !== "ready"}
                    compact
                    onSelect={(preset) => {
                      if (
                        data.status === "ready" &&
                        data.page?.items.some((item) => item.id === preset.id)
                      ) {
                        onSelect(preset)
                        setOpen(false)
                      }
                    }}
                  />
                  {data.status === "ready" && !items.length && (
                    <p className="p-5 text-sm text-white/50">
                      No looks match this search.
                    </p>
                  )}
                </div>
              </DialogBody>
            </>
          )}
        </DialogContent>
      </Dialog>
      {value && (
        <button
          type="button"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white/40 hover:text-white"
          aria-label={`Clear ${config.pickerLabel.toLowerCase()}`}
          onClick={onClear}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
