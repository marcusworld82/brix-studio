"use client"

import Image from "next/image"
import { AtSign, AudioLines, Film, ImageIcon, Plus, X } from "lucide-react"
import { useId, useRef, useState } from "react"
import { PromptBox } from "@/components/studio/prompt-box"
import { AssetLibraryModal } from "@/components/studio/asset-library"
import { mediaPreviewUrl } from "@/lib/studio/media-preview-url"
import { referenceIdentity, referenceIndex } from "./reference-identity"
import {
  uploadAsset,
  type AssetLibraryItem,
  type AssetSelection,
} from "@/lib/studio/uploads"
import {
  readLiveMediaUrls,
  encodeLiveMediaUrls,
  type LiveMediaField,
  liveMentionToken,
  remapLiveMentionTokens,
  LIVE_REFERENCE_APP_LIMIT,
} from "@/generation/catalog/media-constraints"

/** @ selects real model inputs, inserting native prompt tokens only when verified. */
export function LiveReferencePrompt({
  fields,
  values,
  prompt,
  onPromptChange,
  onFieldChange,
  library,
  signedIn,
  onSignIn,
  maxLength,
  onGenerate,
}: {
  fields: LiveMediaField[]
  values: Record<string, unknown>
  prompt: string
  onPromptChange: (value: string) => void
  onFieldChange: (key: string, value: unknown, promptOverride?: string) => void
  library: AssetLibraryItem[]
  signedIn: boolean
  onSignIn: () => void
  maxLength?: number
  onGenerate: () => void
}) {
  const id = useId()
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [targetKey, setTargetKey] = useState(fields[0]?.key ?? "")
  const [range, setRange] = useState<{ start: number; end: number } | null>(
    null
  )
  const [active, setActive] = useState(0)
  const [notice, setNotice] = useState("")
  const target = fields.find((field) => field.key === targetKey) ?? fields[0]
  const attached = fields.flatMap((field) =>
    readLiveMediaUrls(field, values[field.key]).map((src, index) => ({
      field,
      src,
      index,
    }))
  )
  const currentUrls = target
    ? readLiveMediaUrls(target, values[target.key])
    : []
  const otherCount = attached.length - currentUrls.length
  const targetCapacity = target
    ? Math.max(
        0,
        Math.min(
          target.maxItems ?? LIVE_REFERENCE_APP_LIMIT,
          LIVE_REFERENCE_APP_LIMIT - otherCount
        )
      )
    : 0
  const remaining = target
    ? target.array
      ? Math.max(0, targetCapacity - currentUrls.length)
      : targetCapacity
    : 0
  const visible = library
    .filter(
      (item, index, all) =>
        item.kind === target?.kind &&
        (target?.mentionSyntax !== null ||
          referenceIndex(currentUrls, item.src) < 0) &&
        all.findIndex(
          (candidate) =>
            referenceIdentity(candidate.src) === referenceIdentity(item.src)
        ) === index &&
        `${item.name ?? ""} ${item.kind} ${target && referenceIndex(currentUrls, item.src) >= 0 ? (liveMentionToken(target, referenceIndex(currentUrls, item.src)) ?? "") : ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
    )
    .slice(0, LIVE_REFERENCE_APP_LIMIT)

  function attach(picked: AssetSelection[]) {
    if (!target || !picked.length) return
    const valid = picked.filter(
      (item) =>
        item.kind === target.kind &&
        (target.mentionSyntax || referenceIndex(currentUrls, item.src) < 0)
    )
    if (!valid.length) return
    const fresh = valid.filter(
      (item) => referenceIndex(currentUrls, item.src) < 0
    )
    if (fresh.length && !remaining) return
    const next = target.array
      ? [...new Set([...currentUrls, ...fresh.map((item) => item.src)])].slice(
          0,
          targetCapacity
        )
      : [valid[0].src]
    const tokens = valid.flatMap((item) => {
      const index = referenceIndex(next, item.src)
      const token = index < 0 ? null : liveMentionToken(target, index)
      return token ? [token] : []
    })
    let marker = `\uE000${id}\uE001`
    while (prompt.includes(marker)) marker += "\uE001"
    const withMarker = range
      ? prompt.slice(0, range.start) + marker + prompt.slice(range.end)
      : tokens.length
        ? prompt + (prompt && !/\s$/.test(prompt) ? " " : "") + marker
        : prompt
    const nextPrompt = remapLiveMentionTokens(
      withMarker,
      target,
      currentUrls,
      next
    ).replace(marker, tokens.join(" "))
    onFieldChange(target.key, encodeLiveMediaUrls(target, next), nextPrompt)
    setNotice(
      tokens.length
        ? `Reference mention ${tokens.join(" ")} inserted.`
        : `Attached to ${target.name}. This model uses attached files without @ prompt tokens.`
    )
    setOpen(false)
    setRange(null)
    setQuery("")
    requestAnimationFrame(() => textRef.current?.focus())
  }

  return (
    <div className="relative min-w-0">
      {!!attached.length && (
        <div
          className="mb-2 flex max-w-full gap-2 overflow-x-auto py-1"
          aria-label="Attached model references"
        >
          {attached.map(({ field, src, index }) => (
            <div
              className="relative flex w-36 shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-black/15 p-1.5"
              key={`${field.key}:${index}:${src}`}
            >
              {field.kind === "image" ? (
                <Image
                  src={mediaPreviewUrl(src)}
                  alt={`${field.name} ${index + 1}`}
                  unoptimized
                  width={36}
                  height={36}
                  className="size-9 rounded object-cover"
                />
              ) : field.kind === "video" ? (
                <Film className="m-2 size-5 shrink-0 text-white/60" />
              ) : (
                <AudioLines className="m-2 size-5 shrink-0 text-white/60" />
              )}
              <span className="min-w-0 truncate pr-4 text-[11px] text-white/60">
                {liveMentionToken(field, index) ?? `${field.name} ${index + 1}`}
              </span>
              <button
                type="button"
                className="absolute top-0 right-0 flex size-7 items-center justify-center rounded-lg text-white/60 hover:text-white"
                aria-label={`Remove ${field.name} ${index + 1}`}
                onClick={() => {
                  const urls = readLiveMediaUrls(
                    field,
                    values[field.key]
                  ).filter((_, i) => i !== index)
                  onFieldChange(
                    field.key,
                    !urls.length && !field.required
                      ? undefined
                      : encodeLiveMediaUrls(field, urls)
                  )
                }}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <PromptBox.Field
        ref={textRef}
        aria-label="Prompt"
        aria-controls={open ? `${id}-options` : undefined}
        aria-activedescendant={
          open && visible[active] ? `${id}-option-${active}` : undefined
        }
        aria-describedby={notice ? `${id}-notice` : undefined}
        placeholder={
          fields.length
            ? "Describe your scene. Type @ to attach a reference."
            : "Describe the scene you imagine"
        }
        className="pr-12"
        value={prompt}
        maxLength={maxLength}
        onChange={(event) => {
          const next = event.target.value
          const caret = event.target.selectionStart
          const match = next.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/)
          onPromptChange(next)
          setActive(0)
          if (match && fields.length) {
            setRange({
              start: next.slice(0, caret).lastIndexOf("@"),
              end: caret,
            })
            setQuery(match[1])
            setOpen(true)
          } else {
            setOpen(false)
            setRange(null)
          }
        }}
        onKeyDown={(event) => {
          if (open && event.key === "Escape") {
            event.preventDefault()
            setOpen(false)
            return
          }
          if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault()
            setActive((old) =>
              visible.length
                ? (old + (event.key === "ArrowDown" ? 1 : visible.length - 1)) %
                  visible.length
                : 0
            )
            return
          }
          if (
            open &&
            event.key === "Enter" &&
            !event.metaKey &&
            !event.ctrlKey &&
            visible[active]
          ) {
            event.preventDefault()
            attach([visible[active]])
            return
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            onGenerate()
          }
        }}
      />
      <button
        type="button"
        className="absolute right-0 bottom-0 flex size-10 items-center justify-center rounded-xl bg-white/5 text-white/60 hover:text-white disabled:opacity-30"
        disabled={!fields.length}
        title={
          fields.length
            ? "Attach references with @"
            : "This model has no supported media input"
        }
        aria-label="Attach references with @"
        aria-expanded={open}
        onClick={() => {
          setRange(null)
          setQuery("")
          setActive(0)
          setOpen(!open)
        }}
      >
        <AtSign className="size-4" />
      </button>
      {notice && (
        <p id={`${id}-notice`} className="sr-only" role="status">
          {notice}
        </p>
      )}
      {open && (
        <section
          className="absolute right-0 bottom-full left-0 z-40 mb-2 max-h-[45dvh] overflow-y-auto rounded-2xl border border-white/15 bg-[#1b1e23] p-3 shadow-xl"
          aria-label="Reference picker"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="text-xs">Attach a model reference</strong>
            <button
              type="button"
              aria-label="Close reference picker"
              className="flex size-8 items-center justify-center"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </button>
          </div>
          <label className="mb-2 flex flex-col gap-1 text-[11px] text-white/60">
            Model input
            <select
              aria-label="Reference input"
              className="min-h-10 w-full min-w-0 rounded-lg border border-white/10 bg-page px-2 text-xs text-white"
              value={target?.key ?? ""}
              onChange={(event) => {
                setTargetKey(event.target.value)
                setActive(0)
              }}
            >
              {fields.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.name} · {field.kind} ·{" "}
                  {readLiveMediaUrls(field, values[field.key]).length}/
                  {field.maxItems ?? "provider max unspecified"}
                </option>
              ))}
            </select>
          </label>
          {target && (
            <p className="mb-3 text-[11px] leading-relaxed text-white/50">
              {target.maxItems === null
                ? "Provider maximum is not published. The studio allows up to 60 references in total."
                : `This input allows up to ${target.maxItems} ${target.kind} ${target.maxItems === 1 ? "file" : "files"}.`}
              {target.description ? ` ${target.description}` : ""}{" "}
              {target.mentionSyntax
                ? "Choose a file to mention it in your prompt."
                : "Attach files here. Prompt mentions are not documented for this model."}
            </p>
          )}
          {!signedIn ? (
            <button
              type="button"
              className="min-h-10 text-xs text-lime"
              onClick={onSignIn}
            >
              Sign in to attach private files
            </button>
          ) : (
            <>
              <div
                id={`${id}-options`}
                role="listbox"
                aria-label="Available references"
                className="grid gap-1"
              >
                {visible.map((item, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    id={`${id}-option-${index}`}
                    key={item.src}
                    disabled={
                      !remaining && referenceIndex(currentUrls, item.src) < 0
                    }
                    className={`flex min-h-10 items-center gap-2 rounded-lg px-2 text-left text-xs disabled:opacity-40 ${index === active ? "bg-white/10" : "hover:bg-white/5"}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => attach([item])}
                  >
                    {item.kind === "image" ? (
                      <ImageIcon className="size-4 shrink-0" />
                    ) : item.kind === "video" ? (
                      <Film className="size-4 shrink-0" />
                    ) : (
                      <AudioLines className="size-4 shrink-0" />
                    )}
                    <span className="truncate">
                      {item.name ?? `${item.kind} reference`}
                    </span>
                    {target && referenceIndex(currentUrls, item.src) >= 0 && (
                      <span className="ml-auto shrink-0 text-[11px] text-lime">
                        {liveMentionToken(
                          target,
                          referenceIndex(currentUrls, item.src)
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {!remaining && (
                <p className="py-2 text-xs text-amber-200">
                  This input is full. Remove a reference before adding another.
                </p>
              )}
              {remaining > 0 && !visible.length && (
                <p className="py-2 text-xs text-white/50">
                  No matching {target?.kind} files. Upload one or choose another
                  model input.
                </p>
              )}
              {target && (
                <AssetLibraryModal
                  items={library}
                  accept={[target.kind]}
                  excludeIds={currentUrls}
                  maxSelections={remaining || 1}
                  onUpload={uploadAsset}
                  onSelectMany={attach}
                  trigger={
                    <button
                      type="button"
                      disabled={!remaining}
                      className="mt-2 flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs disabled:opacity-40"
                    >
                      <Plus className="size-4" />
                      Upload or browse {target.kind} files
                    </button>
                  }
                />
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
