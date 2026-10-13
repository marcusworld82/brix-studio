"use client"

import { VideoThumbnail } from "@/components/media/video-thumbnail"

/* eslint-disable @next/next/no-img-element */
import { useState, type DragEvent } from "react"
import {
  AudioLines,
  Check,
  Ellipsis,
  ImageIcon,
  Loader2,
  Play,
  Plus,
  Video,
  X,
} from "lucide-react"

import { AssetLibraryModal } from "@/components/studio/asset-library"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  inputRoles,
  MEDIA_ROLES,
  REFERENCE_ROLE,
  ROLE_KIND,
  ROLE_LABEL,
  roleName,
} from "@/generation/catalog/media-inputs"
import type {
  MediaItem,
  MediaKind,
  MediaRole,
  ModelEntry,
} from "@/generation/catalog/types"
import { cn } from "@/lib/utils"

import type { Generator } from "./use-generator"

const KIND_ICON = { image: ImageIcon, video: Video, audio: AudioLines } as const

/** Roles rendered as dedicated tiles rather than the mixed reference picker. */
export function slotRoles(model: ModelEntry, mode?: string): MediaRole[] {
  const limits = mode ? inputRoles(model, mode) : model.roles
  return MEDIA_ROLES.filter(
    (role) =>
      !!limits[role] &&
      (role === "start" ||
        role === "end" ||
        role === "source" ||
        ((role === "video" || role === "audio") && limits[role] === 1))
  )
}

function slotHint(model: ModelEntry, role: MediaRole): string {
  if (role === "source")
    return model.tab === "motion" ? "Video · 3–30 s" : "Video · up to 30 s"
  if (role === "start")
    return model.tab === "motion" ? "Image with visible face and body" : "Image"
  if (role === "end") return "Optional · image"
  return ROLE_KIND[role] === "audio" ? "Audio" : "Video"
}

function Preview({ item }: { item: MediaItem }) {
  const kind = item.kind ?? ROLE_KIND[item.role]
  if (kind === "video")
    return <VideoThumbnail src={item.url} name={item.name} />
  if (kind === "audio")
    return (
      <span className="flex size-full items-center justify-center bg-raised">
        <AudioLines className="size-5 text-lime" />
      </span>
    )
  return (
    <img
      src={item.url}
      alt={item.name ?? "Reference"}
      className="size-full object-cover"
    />
  )
}

export function MediaZone({ generator }: { generator: Generator }) {
  const { model, media, inputMode, library } = generator
  const [modeView, setModeView] = useState<string | undefined>(undefined)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  if (!model) return null

  const modes = model.mediaModes ?? []
  const activeMode = inputMode ?? modeView ?? modes[0]?.id
  const limits = activeMode ? inputRoles(model, activeMode) : model.roles
  const slots = slotRoles(model, activeMode)
  const referenceKinds = (Object.keys(REFERENCE_ROLE) as MediaKind[]).filter(
    (kind) =>
      !slots.includes(REFERENCE_ROLE[kind]) &&
      (limits[REFERENCE_ROLE[kind]] ?? 0) > 0
  )
  const kindLimits = Object.fromEntries(
    referenceKinds.map((kind) => [
      kind,
      Math.max(
        0,
        (limits[REFERENCE_ROLE[kind]] ?? 0) -
          media.filter((item) => item.role === REFERENCE_ROLE[kind]).length
      ),
    ])
  )
  const remaining = Object.values(kindLimits).reduce(
    (total, count) => total + count,
    0
  )
  const references = media.filter((item) => !slots.includes(item.role))
  const imageRoles = (["reference", "start", "end"] as const).filter(
    (role) => model.roles[role]
  )

  const drop = async (event: DragEvent, role: MediaRole | "auto") => {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (!files.length) return
    setUploading(true)
    setLocalError(null)
    try {
      const uploaded = []
      for (const file of files.slice(0, role === "auto" ? remaining : 1))
        uploaded.push(await library.onUpload(file))
      generator.addMedia(role, uploaded)
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "Upload failed.")
    } finally {
      setUploading(false)
    }
  }

  const tryAdd = (
    role: MediaRole | "auto",
    selection: Parameters<Generator["addMedia"]>[1]
  ) => {
    try {
      setLocalError(null)
      generator.addMedia(role, selection)
    } catch (caught) {
      throw caught instanceof Error
        ? caught
        : new Error("Could not attach this media.")
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {modes.length > 1 ? (
        <div
          className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1"
          role="tablist"
          aria-label="Input mode"
        >
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={activeMode === mode.id}
              onClick={() => {
                if (activeMode === mode.id) return
                setModeView(mode.id)
                if (media.length) generator.clearMedia()
              }}
              className={cn(
                "h-10 rounded-[10px] text-sm font-medium transition-colors",
                activeMode === mode.id
                  ? "bg-hover text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      ) : null}

      {slots.length ? (
        <div
          className={cn(
            "grid gap-2",
            slots.length > 1 ? "grid-cols-2" : "grid-cols-1"
          )}
        >
          {slots.map((role) => {
            const item = media.find((entry) => entry.role === role)
            const name = roleName(model, role)
            const required = model.requiredRoles?.includes(role)
            const Icon = KIND_ICON[ROLE_KIND[role]]
            return (
              <div
                key={role}
                className="group relative"
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => void drop(event, role)}
              >
                <AssetLibraryModal
                  items={library.items}
                  onUpload={library.onUpload}
                  accept={[ROLE_KIND[role]]}
                  excludeIds={media
                    .filter((entry) => entry.role !== role)
                    .map((entry) => entry.url)}
                  onSelect={(selection) => tryAdd(role, [selection])}
                  trigger={
                    <button
                      type="button"
                      // Empty slots are named by their visible text; filled ones show only media.
                      aria-label={
                        item ? `Replace ${name.toLowerCase()}` : undefined
                      }
                      className={cn(
                        "relative flex h-[120px] w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border border-dashed border-white/12 bg-transparent px-3 text-center transition-colors hover:border-white/25 hover:bg-white/[0.02]",
                        item && "border-solid border-white/10"
                      )}
                    >
                      {item ? (
                        <span className="absolute inset-0">
                          <Preview item={item} />
                        </span>
                      ) : (
                        <>
                          <span className="flex size-8 items-center justify-center rounded-full bg-hover">
                            <Icon className="size-4 text-muted-foreground" />
                          </span>
                          <span className="text-sm font-medium text-white/80 first-letter:uppercase">
                            {name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {required ? "Required · " : ""}
                            {slotHint(model, role)}
                          </span>
                        </>
                      )}
                    </button>
                  }
                />
                {item ? (
                  <button
                    type="button"
                    aria-label={`Remove ${name.toLowerCase()}`}
                    onClick={() => generator.removeMedia(item.id)}
                    className="absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-full bg-black/70 text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {referenceKinds.length ? (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => void drop(event, "auto")}
          className={cn(
            "rounded-2xl border border-dashed border-white/12 transition-colors",
            dragging && "border-lime/60 bg-lime/5"
          )}
        >
          <AssetLibraryModal
            items={library.items}
            onUpload={library.onUpload}
            accept={referenceKinds}
            kindLimits={kindLimits}
            maxSelections={remaining}
            excludeIds={media.map((item) => item.url)}
            onSelectMany={(selection) => tryAdd("auto", selection)}
            trigger={
              <button
                type="button"
                disabled={!remaining}
                className="flex w-full flex-col items-center gap-2 px-4 py-5 text-center disabled:opacity-50"
              >
                <span className="flex -space-x-2">
                  {referenceKinds.map((kind) => {
                    const Icon = KIND_ICON[kind]
                    return (
                      <span
                        key={kind}
                        className="flex size-8 items-center justify-center rounded-full bg-hover ring-2 ring-panel"
                      >
                        <Icon className="size-3.5 text-muted-foreground" />
                      </span>
                    )
                  })}
                </span>
                <span className="text-sm font-medium text-white/80">
                  {uploading
                    ? "Uploading…"
                    : remaining
                      ? "Add references"
                      : "Reference limit reached"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {referenceKinds
                    .map((kind) => kind[0]!.toUpperCase() + kind.slice(1))
                    .join(", ")}
                  {" · "}up to{" "}
                  {referenceKinds
                    .map((kind) => limits[REFERENCE_ROLE[kind]])
                    .join("/")}
                </span>
              </button>
            }
          />
          {references.length ? (
            <div className="flex flex-wrap gap-2 border-t border-white/5 p-3">
              {references.map((item, index) => (
                <div
                  key={item.id}
                  className="group relative size-12 shrink-0"
                  title={item.name ?? `Reference ${index + 1}`}
                >
                  <span className="block size-full overflow-hidden rounded-xl bg-surface">
                    <Preview item={item} />
                  </span>
                  {(item.kind ?? ROLE_KIND[item.role]) === "video" ? (
                    <Play className="pointer-events-none absolute bottom-1 left-1 size-3 fill-white text-white" />
                  ) : null}
                  {ROLE_KIND[item.role] === "image" && imageRoles.length > 1 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Role for ${item.name ?? "image"}`}
                        className="absolute -top-1 -left-1 z-10 flex size-5 items-center justify-center rounded-full bg-background/90 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Ellipsis className="size-3" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="top"
                        align="start"
                        sideOffset={6}
                      >
                        {imageRoles.map((role) => (
                          <DropdownMenuItem
                            key={role}
                            onClick={() => generator.changeRole(item.id, role)}
                          >
                            {role === "reference"
                              ? "Reference image"
                              : ROLE_LABEL[role]}
                            {item.role === role ? (
                              <Check className="ml-auto size-3" />
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Remove ${item.name ?? "reference"}`}
                    onClick={() => generator.removeMedia(item.id)}
                    className="absolute -top-1 -right-1 z-10 flex size-5 items-center justify-center rounded-full bg-background/90 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {remaining ? (
                <AssetLibraryModal
                  items={library.items}
                  onUpload={library.onUpload}
                  accept={referenceKinds}
                  kindLimits={kindLimits}
                  maxSelections={remaining}
                  excludeIds={media.map((item) => item.url)}
                  onSelectMany={(selection) => tryAdd("auto", selection)}
                  trigger={
                    <button
                      type="button"
                      aria-label="Add more references"
                      className="flex size-12 items-center justify-center rounded-xl border border-dashed border-white/15 text-muted-foreground hover:text-foreground"
                    >
                      {uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                    </button>
                  }
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {localError ? (
        <p role="alert" className="text-xs text-[#ff6b6b]">
          {localError}
        </p>
      ) : null}
    </div>
  )
}
