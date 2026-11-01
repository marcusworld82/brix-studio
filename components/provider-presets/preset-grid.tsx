"use client"
import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, Eye } from "lucide-react"
import type {
  ProviderPreset,
  ProviderPresetCatalog,
} from "@/lib/higgsfield/preset-types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog"
import { PresetPreview } from "./preset-preview"
import { presetGeneratorHref } from "./catalogs"

export function PresetGrid({
  items,
  catalog,
  selectedId,
  onSelect,
  disabled = false,
  compact = false,
}: {
  items: ProviderPreset[]
  catalog: ProviderPresetCatalog
  selectedId?: string
  onSelect?: (preset: ProviderPreset) => void
  disabled?: boolean
  compact?: boolean
}) {
  const [preview, setPreview] = useState<ProviderPreset | null>(null)
  const previewUnavailable =
    disabled || !items.some((item) => item.id === preview?.id)
  return (
    <>
      <div
        className={`grid min-w-0 gap-3 ${compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"}`}
      >
        {items.map((preset) => (
          <article
            key={preset.id}
            className={`min-w-0 overflow-hidden rounded-xl border bg-[#171c22] ${selectedId === preset.id ? "border-[#0582ca]" : "border-white/10"}`}
          >
            <button
              type="button"
              onClick={() => setPreview(preset)}
              className="relative block w-full text-left"
              aria-label={`Preview ${preset.name}`}
            >
              <PresetPreview preset={preset} />
              <span className="absolute right-2 bottom-2 rounded-md bg-black/75 p-1.5 text-white/80">
                <Eye className="size-3.5" />
              </span>
              {selectedId === preset.id && (
                <span className="absolute top-2 left-2 rounded bg-[#006494] p-1 text-white">
                  <Check className="size-4" />
                </span>
              )}
            </button>
            <div className="space-y-2 p-3">
              <h3 className="min-h-9 text-xs leading-5 font-medium sm:text-sm">
                {preset.name}
              </h3>
              {onSelect ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(preset)}
                  className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg bg-white/5 px-3 text-xs text-white/80 hover:bg-[#006494] disabled:opacity-35"
                >
                  {selectedId === preset.id ? "Selected" : "Use this look"}
                  <ArrowRight className="size-3.5" />
                </button>
              ) : (
                <Link
                  className={`flex min-h-10 items-center justify-between gap-2 rounded-lg bg-white/5 px-3 text-xs text-white/80 hover:bg-[#006494] ${disabled ? "pointer-events-none opacity-35" : ""}`}
                  aria-disabled={disabled}
                  tabIndex={disabled ? -1 : undefined}
                  href={presetGeneratorHref(catalog, preset.id)}
                >
                  Use in {catalog === "genjutsu" ? "video" : "image"}
                  <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{preview?.name ?? "Provider preview"}</DialogTitle>
            <DialogDescription>
              {preview?.description ??
                "Provider-supplied preview. Choosing this look does not start generation."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {preview && <PresetPreview preset={preview} video large />}
          </DialogBody>
          {preview &&
            (onSelect ? (
              <button
                type="button"
                disabled={previewUnavailable}
                onClick={() => {
                  if (previewUnavailable) return
                  onSelect(preview)
                  setPreview(null)
                }}
                className="min-h-11 rounded-xl bg-[#006494] px-4 text-sm text-white disabled:opacity-35"
              >
                Use this look
              </button>
            ) : (
              <Link
                aria-disabled={previewUnavailable}
                tabIndex={previewUnavailable ? -1 : undefined}
                className={`flex min-h-11 items-center justify-center rounded-xl bg-[#006494] px-4 text-sm text-white ${previewUnavailable ? "pointer-events-none opacity-35" : ""}`}
                href={presetGeneratorHref(catalog, preview.id)}
              >
                Open generator with this look
              </Link>
            ))}
        </DialogContent>
      </Dialog>
    </>
  )
}
