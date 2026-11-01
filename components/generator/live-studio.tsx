"use client"

import Link from "next/link"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  RefreshCw,
  Loader2,
  Plus,
  ImageIcon,
  Film,
  ArrowRight,
  X,
} from "lucide-react"
import type {
  LiveCatalog,
  LiveModelDefinition,
} from "@/generation/catalog/live-types"
import type { GenerationView } from "@/lib/generations/view"
import type { Surface } from "@/generation/catalog/types"
import {
  useApp,
  announceBalanceChange,
} from "@/components/providers/app-providers"
import { useApiPrice } from "./use-api-price"
import { formatUsd } from "@/lib/billing/usd"
import { useRuns } from "@/lib/studio/use-runs"
import {
  uploadAsset,
  useUploads,
  uploadToLibraryItem,
  type AssetSelection,
} from "@/lib/studio/uploads"
import {
  runToGalleryItems,
  runToLibraryItems,
} from "@/lib/studio/gallery-items"
import { AssetLibraryModal } from "@/components/studio/asset-library"
import { UserGenerations } from "@/components/studio/user-generations"
import { VideoThumbnail } from "@/components/media/video-thumbnail"
import { mediaPreviewUrl } from "@/lib/studio/media-preview-url"
import { useTileActions } from "./tile-actions"

const fieldClass =
  "w-full min-w-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-lime"
type Json = Record<string, unknown>
const record = (v: unknown): v is Json =>
  !!v && typeof v === "object" && !Array.isArray(v)

export function AutomaticStudio({
  surface,
  children,
}: {
  surface: Surface
  children: ReactNode
}) {
  const params = useSearchParams()
  const [choice, setGuided] = useState<boolean | null>(null)
  const guided =
    choice ??
    !!(
      (params.get("model") && !params.get("model")?.startsWith("hf:")) ||
      params.get("preset") ||
      params.get("reuse") ||
      params.get("animate") ||
      params.get("tab")
    )
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-xs">
        <div
          role="group"
          aria-label="Workspace version"
          className="flex gap-1 rounded-lg bg-white/5 p-1"
        >
          <button
            onClick={() => setGuided(false)}
            aria-pressed={!guided}
            className={`rounded-md px-3 py-1.5 ${!guided ? "bg-white/10 text-white" : "text-white/50"}`}
          >
            Live models
          </button>
          <button
            onClick={() => setGuided(true)}
            aria-pressed={guided}
            className={`rounded-md px-3 py-1.5 ${guided ? "bg-white/10 text-white" : "text-white/50"}`}
          >
            Guided workspace
          </button>
        </div>
        <Link href="/pricing" className="text-white/60 hover:text-white">
          Prices & deals
        </Link>
      </div>
      {guided ? children : <LiveStudio surface={surface} />}
    </div>
  )
}

export function LiveStudio({ surface }: { surface: Surface }) {
  const { user, openAuth } = useApp()
  const params = useSearchParams()
  const [catalog, setCatalog] = useState<LiveCatalog | null>(null)
  const [selected, setSelected] = useState(
    params.get("liveModel") ??
      (params.get("model")?.startsWith("hf:") ? params.get("model")! : "")
  )
  const [definition, setDefinition] = useState<LiveModelDefinition | null>(null)
  const lastModel = useRef("")
  const [formRevision, setFormRevision] = useState(0)
  const [values, setValues] = useState<Json>({})
  const [invalid, setInvalid] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const runs = useRuns({ surface, enabled: !!user })
  const uploadState = useUploads()
  const loadUploads = uploadState.load
  useEffect(() => {
    if (user) void loadUploads()
  }, [user, loadUploads])
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !Array.isArray(data.models))
        throw new Error(data.error || "Could not load models.")
      setCatalog(data)
      setSelected((current) =>
        data.models.some(
          (m: { id: string; surface: string }) =>
            m.id === current && m.surface === surface
        )
          ? current
          : (data.models.find(
              (m: { path: string }) =>
                m.path ===
                (surface === "image"
                  ? "higgsfield-ai/soul/v2/standard"
                  : "kling-video/v3.0-turbo/text-to-video")
            )?.id ??
            data.models.find((m: { surface: string }) => m.surface === surface)
              ?.id ??
            "")
      )
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load models."
      )
    }
  }, [surface])
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0)
    const timer = setInterval(() => void load(), 60_000)
    const focus = () => void load()
    window.addEventListener("focus", focus)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
      window.removeEventListener("focus", focus)
    }
  }, [load])
  useEffect(() => {
    if (!selected) return
    const controller = new AbortController()
    let active = true
    void fetch(`/api/catalog?id=${encodeURIComponent(selected)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok || !data.model)
          throw new Error(data.error || "Could not load model inputs.")
        if (active) {
          setDefinition(data.model)
          if (lastModel.current !== selected) {
            setValues(data.model.defaults ?? {})
            setInvalid({})
            lastModel.current = selected
          }
          setError("")
        }
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof Error ? caught.message : "Could not load model."
          )
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [selected, catalog?.fetchedAt])
  const current = definition?.id === selected ? definition : null
  const input = current
    ? {
        modelId: current.id,
        prompt: typeof values.prompt === "string" ? values.prompt : "",
        settings: { providerInput: values },
        media: [],
      }
    : null
  const price = useApiPrice(
    input,
    !!user?.apiKeyConnected &&
      !!current &&
      !current.stale &&
      !Object.keys(invalid).length,
    user?.apiConnectionVersion
  )
  const models = (catalog?.models ?? []).filter((m) => m.surface === surface)
  const visible = models.filter((m) =>
    `${m.label} ${m.family}`.toLowerCase().includes(search.toLowerCase())
  )
  const properties = record(current?.inputSchema.properties)
    ? current.inputSchema.properties
    : {}
  const required = Array.isArray(current?.inputSchema.required)
    ? (current.inputSchema.required as string[])
    : []
  const ordered = Object.entries(properties).sort(([a], [b]) =>
    a === "prompt" ? -1 : b === "prompt" ? 1 : 0
  )
  const library = [
    ...uploadState.uploads.map(uploadToLibraryItem),
    ...runs.records.flatMap(runToLibraryItems),
  ]
  const patch = (key: string, value: unknown) =>
    setValues((old) => {
      const next = { ...old }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
  const fieldError = (key: string, message: string) =>
    setInvalid((old) => {
      const next = { ...old }
      if (message) next[key] = message
      else delete next[key]
      return next
    })
  const reuse = useCallback((run: GenerationView) => {
    if (!run.modelId.startsWith("hf:")) {
      setError("Open the guided workspace to reuse this guided generation.")
      return
    }
    const saved = { ...run.settings }
    delete saved.aspectRatio
    lastModel.current = run.modelId
    setSelected(run.modelId)
    setValues(saved)
    setInvalid({})
    setFormRevision((revision) => revision + 1)
    setError("")
  }, [])
  const { actions, dialogs } = useTileActions({ runs, reuse })
  const items = useMemo(
    () => runs.records.flatMap(runToGalleryItems),
    [runs.records]
  )
  async function generate() {
    if (!user) {
      openAuth({ mode: "signup" })
      return
    }
    if (!user.apiKeyConnected) return
    if (
      !current ||
      price.status !== "ready" ||
      price.usd === null ||
      submitting ||
      Object.keys(invalid).length
    )
      return
    setSubmitting(true)
    setError("")
    try {
      const outcome = await runs.submit({
        ...input!,
        submitKey: crypto.randomUUID(),
        expectedUsd: price.usd,
      })
      if (!outcome.ok) {
        setError(outcome.error)
        if (outcome.code === "PRICE_CHANGED") announceBalanceChange()
      }
    } finally {
      setSubmitting(false)
    }
  }
  const priceLabel =
    price.status === "ready" && price.usd !== null
      ? `${price.estimated ? "Est. " : ""}${formatUsd(price.usd)}`
      : price.status === "loading"
        ? "Pricing…"
        : "Price pending"
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-2 md:flex-row md:overflow-hidden md:px-4">
      <section
        className="studio-backdrop flex w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 md:w-[360px] md:shrink-0"
        aria-label="Live model generation settings"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <h1 className="font-display text-xl">
              {surface === "image" ? "Image studio" : "Video studio"}
            </h1>
            <p className="mt-1 text-xs text-white/50">
              {models.length} current API modes · updates automatically
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="rounded-lg p-2 hover:bg-white/10"
            aria-label="Refresh live catalog"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
        <div className="flex min-w-0 flex-col gap-4 overflow-y-auto p-4 md:min-h-0 md:flex-1">
          <input
            className={fieldClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a model"
            aria-label="Find a model"
          />
          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-white/70">
            Model
            <select
              className={fieldClass}
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value)
                setError("")
              }}
            >
              {!visible.some((m) => m.id === selected) &&
              models.find((m) => m.id === selected) ? (
                <option value={selected}>
                  {models.find((m) => m.id === selected)?.label}
                </option>
              ) : null}
              {visible.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {catalog?.stale ? (
            <p role="status" className="text-xs text-amber-300">
              Showing saved catalog data. Waiting for the provider to refresh.
            </p>
          ) : (
            <p className="text-xs text-white/40">
              Catalog checked{" "}
              {catalog
                ? new Date(catalog.fetchedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "…"}
            </p>
          )}
          {current ? (
            <>
              <p className="text-xs leading-relaxed text-white/60">
                {current.description}
              </p>
              {ordered.map(([key, raw]) =>
                record(raw) ? (
                  <LiveField
                    key={`${current.id}:${formRevision}:${key}`}
                    name={key}
                    schema={raw}
                    required={required.includes(key)}
                    value={values[key]}
                    onChange={(v) => patch(key, v)}
                    onError={(message) => fieldError(key, message)}
                    library={library}
                    signedIn={!!user}
                  />
                ) : null
              )}
              {current.stale ? (
                <p className="text-xs text-amber-300">
                  A current input schema is needed before generating.
                </p>
              ) : null}
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-white/50">
              <Loader2 className="size-4 animate-spin" /> Loading model inputs…
            </p>
          )}
          {error || runs.error ? (
            <p
              role="alert"
              className="rounded-xl border border-red-400/25 bg-red-400/5 p-3 text-xs text-red-200"
            >
              {error || runs.error}
            </p>
          ) : null}
          {price.error ? (
            <p role="status" className="text-xs text-amber-200">
              {price.error}
            </p>
          ) : null}
        </div>
        <div className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-2 border-t border-white/10 bg-page p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {!user ? (
            <button
              className="btn-keycap h-12 rounded-xl text-sm font-semibold"
              onClick={() => openAuth({ mode: "signup" })}
            >
              Create your account <ArrowRight className="ml-2 inline size-4" />
            </button>
          ) : !user.apiKeyConnected ? (
            <Link
              className="btn-keycap flex h-12 items-center justify-center rounded-xl text-sm font-semibold"
              href="/account"
            >
              Connect your API key
            </Link>
          ) : (
            <button
              className="btn-keycap btn-keycap-generate flex min-h-12 items-center justify-center gap-3 rounded-xl px-3 text-sm font-semibold disabled:opacity-50"
              onClick={() => void generate()}
              disabled={
                price.status !== "ready" ||
                submitting ||
                !current ||
                current.stale ||
                !!Object.keys(invalid).length
              }
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Generate{" "}
              <span aria-live="polite" className="font-mono">
                {priceLabel}
              </span>
            </button>
          )}
          {price.status === "ready" ? (
            <p className="text-center text-[11px] leading-relaxed text-white/50">
              {price.explanation}
              {price.discountUsd
                ? ` Includes ${formatUsd(price.discountUsd)} provider discount.`
                : ""}
            </p>
          ) : (
            <p className="text-center text-[11px] text-white/40">
              A dollar price appears before you generate.
            </p>
          )}
        </div>
      </section>
      <section
        className="studio-backdrop flex min-h-[420px] min-w-0 flex-1 flex-col rounded-2xl border border-white/10 p-3 md:min-h-0"
        aria-label="Your generations"
      >
        <UserGenerations
          items={items}
          title={<span className="text-sm">Your generations</span>}
          actions={(item) =>
            actions(item).filter((action) => action.id !== "template")
          }
          hasMore={runs.hasMore}
          loadingMore={runs.loadingMore}
          onLoadMore={runs.loadMore}
          emptyState={
            <div className="flex min-h-80 flex-col items-center justify-center gap-4 px-5 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-white/5">
                {surface === "image" ? (
                  <ImageIcon className="size-7 text-[#0582ca]" />
                ) : (
                  <Film className="size-7 text-[#0582ca]" />
                )}
              </div>
              <h2 className="font-display text-3xl">Make something yours.</h2>
              <p className="max-w-sm text-sm leading-relaxed text-white/50">
                Choose a model, add your inputs and review the price. Completed
                work stays in your private library.
              </p>
              <Link href="/pricing" className="text-sm text-[#38a6e8]">
                Explore model prices
              </Link>
            </div>
          }
        />
      </section>
      {dialogs}
    </div>
  )
}

function LiveField({
  name,
  schema,
  required,
  value,
  onChange,
  onError,
  library,
  signedIn,
}: {
  name: string
  schema: Json
  required: boolean
  value: unknown
  onChange: (value: unknown) => void
  onError: (message: string) => void
  library: AssetSelection[]
  signedIn: boolean
}) {
  const label =
    typeof schema.title === "string" ? schema.title : name.replaceAll("_", " ")
  const type = Array.isArray(schema.type)
    ? schema.type.find((t) => t !== "null")
    : schema.type
  const isArray = type === "array"
  const mediaKind = /video/i.test(name)
    ? "video"
    : /audio/i.test(name)
      ? "audio"
      : /image|photo|frame/i.test(name)
        ? "image"
        : null
  const media =
    mediaKind &&
    (/urls?$/i.test(name) ||
      schema.format === "uri" ||
      (isArray && record(schema.items) && schema.items.format === "uri")) &&
    (type === "string" || isArray)
  const [uploading, setUploading] = useState(false)
  const [localError, setLocalError] = useState("")
  const urls = media
    ? isArray
      ? Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string")
        : []
      : typeof value === "string"
        ? [value]
        : []
    : []
  if (media) {
    const selections = urls.map((src, index) => ({
      id: src,
      src,
      kind: mediaKind!,
      name: `${label} ${index + 1}`,
    }))
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-xs text-white/70">
          {label}
          {required ? " *" : ""}
        </span>
        <div className="flex flex-wrap gap-2">
          {selections.map((item) => (
            <span
              className="relative block size-24 overflow-hidden rounded-lg border border-white/10"
              key={item.src}
            >
              {mediaKind === "video" ? (
                <VideoThumbnail src={item.src} name={item.name} />
              ) : mediaKind === "image" ? (
                <Image
                  unoptimized
                  width={96}
                  height={96}
                  src={mediaPreviewUrl(item.src)}
                  alt={item.name}
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-xs">
                  Audio attached
                </span>
              )}
              <button
                className="absolute top-1 right-1 rounded-full bg-black/80 p-1"
                aria-label={`Remove ${item.name}`}
                onClick={() =>
                  onChange(
                    isArray ? urls.filter((src) => src !== item.src) : undefined
                  )
                }
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        {signedIn ? (
          <AssetLibraryModal
            items={library.map((item) => ({
              ...item,
              source: "upload" as const,
              createdAt: 0,
            }))}
            accept={[mediaKind!]}
            maxSelections={
              isArray
                ? Math.max(1, Number(schema.maxItems ?? 10) - urls.length)
                : 1
            }
            onUpload={async (file) => {
              setUploading(true)
              setLocalError("")
              try {
                return await uploadAsset(file)
              } catch (error) {
                setLocalError(
                  error instanceof Error ? error.message : "Upload failed."
                )
                throw error
              } finally {
                setUploading(false)
              }
            }}
            onSelectMany={(picked) => {
              onChange(
                isArray
                  ? [...urls, ...picked.map((p) => p.src)]
                  : picked[0]?.src
              )
            }}
            trigger={
              <button
                disabled={
                  uploading ||
                  (isArray && urls.length >= Number(schema.maxItems ?? 10))
                }
                className={`${fieldClass} flex items-center justify-center gap-2`}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}{" "}
                {urls.length && !isArray ? "Replace file" : "Add file"}
              </button>
            }
          />
        ) : (
          <p className="text-xs text-white/40">
            Sign in to attach a private file.
          </p>
        )}
        {localError ? (
          <p className="text-xs text-red-300" role="alert">
            {localError}
          </p>
        ) : null}
        {typeof schema.description === "string" ? (
          <p className="text-[11px] leading-relaxed text-white/40">
            {schema.description}
          </p>
        ) : null}
      </div>
    )
  }
  const content = Array.isArray(schema.enum) ? (
    <select
      className={fieldClass}
      value={
        typeof value === "string" || typeof value === "number"
          ? String(value)
          : ""
      }
      onChange={(e) =>
        onChange(
          type === "integer" || type === "number"
            ? Number(e.target.value)
            : e.target.value
        )
      }
    >
      <option value="" disabled>
        Select {label}
      </option>
      {schema.enum.map((v, index) => (
        <option key={index} value={String(v)}>
          {String(v)}
        </option>
      ))}
    </select>
  ) : type === "boolean" ? (
    <input
      type="checkbox"
      className="size-4 accent-lime"
      checked={value === true}
      onChange={(e) => onChange(e.target.checked)}
    />
  ) : type === "integer" || type === "number" ? (
    <input
      className={fieldClass}
      type="number"
      step={type === "integer" ? 1 : "any"}
      min={typeof schema.minimum === "number" ? schema.minimum : undefined}
      max={typeof schema.maximum === "number" ? schema.maximum : undefined}
      value={typeof value === "number" ? value : ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? undefined : Number(e.target.value))
      }
    />
  ) : type === "string" ? (
    name === "prompt" || Number(schema.maxLength) > 500 ? (
      <textarea
        className={`${fieldClass} min-h-28 resize-y`}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={required ? "Required" : "Optional"}
      />
    ) : (
      <input
        className={fieldClass}
        type="text"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={required ? "Required" : "Optional"}
      />
    )
  ) : (
    <JsonField value={value} onChange={onChange} onError={onError} />
  )
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs text-white/70">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      {content}
      {typeof schema.description === "string" ? (
        <span className="text-[11px] leading-relaxed text-white/40">
          {schema.description}
        </span>
      ) : null}
    </label>
  )
}
function JsonField({
  value,
  onChange,
  onError,
}: {
  value: unknown
  onChange: (value: unknown) => void
  onError: (message: string) => void
}) {
  const [raw, setRaw] = useState(() =>
    value === undefined ? "" : JSON.stringify(value, null, 2)
  )
  return (
    <textarea
      className={`${fieldClass} min-h-24 font-mono text-xs`}
      value={raw}
      placeholder="Optional JSON input"
      onChange={(e) => {
        setRaw(e.target.value)
        if (!e.target.value.trim()) {
          onChange(undefined)
          onError("")
          return
        }
        try {
          onChange(JSON.parse(e.target.value))
          onError("")
        } catch {
          onError("Check the JSON input.")
        }
      }}
    />
  )
}
