"use client"

import Image from "next/image"
import { useSearchParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  RefreshCw,
  Loader2,
  Plus,
  ImageIcon,
  Film,
  X,
  SlidersHorizontal,
  ChevronDown,
  Search,
  FolderClosed,
  BookOpen,
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
  type AssetLibraryItem,
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
import { HowItWorks } from "./canvas"
import { PromptBox } from "@/components/studio/prompt-box"
import { LiveReferencePrompt } from "./live-reference-prompt"
import { referenceIdentity } from "./reference-identity"
import {
  effectiveLiveSchema,
  liveMediaFields,
  readLiveMediaUrls,
  encodeLiveMediaUrls,
  type LiveMediaField,
  LIVE_REFERENCE_APP_LIMIT,
  remapLiveMentionTokens,
  validateNativeMentions,
} from "@/generation/catalog/media-constraints"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog"

const fieldClass =
  "w-full min-w-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-lime"
type Json = Record<string, unknown>
const record = (v: unknown): v is Json =>
  !!v && typeof v === "object" && !Array.isArray(v)

export function LiveStudio({ surface }: { surface: Surface }) {
  const { user, openAuth, pricing } = useApp()
  const router = useRouter()
  const params = useSearchParams()
  const [catalog, setCatalog] = useState<LiveCatalog | null>(null)
  const [selected, setSelected] = useState(
    params.get("liveModel") ?? params.get("model") ?? ""
  )
  const [definition, setDefinition] = useState<LiveModelDefinition | null>(null)
  const lastModel = useRef("")
  const previousDefinition = useRef<LiveModelDefinition | null>(null)
  const [formRevision, setFormRevision] = useState(0)
  const [values, setValues] = useState<Json>({})
  const [invalid, setInvalid] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [acceptedUsageFor, setAcceptedUsageFor] = useState("")
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [canvasChoice, setCanvasChoice] = useState<"history" | "how" | null>(
    null
  )
  const dockRef = useRef<HTMLDivElement>(null)
  const [dockHeight, setDockHeight] = useState(180)
  useEffect(() => {
    if (!dockRef.current) return
    const observer = new ResizeObserver(([entry]) =>
      setDockHeight(entry.target.getBoundingClientRect().height)
    )
    observer.observe(dockRef.current)
    return () => observer.disconnect()
  }, [])
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
          const prior = previousDefinition.current
          previousDefinition.current = data.model
          setDefinition(data.model)
          if (lastModel.current !== selected) {
            setValues((old) => {
              let prompt = typeof old.prompt === "string" ? old.prompt : ""
              if (prior && prior.id !== data.model.id)
                for (const field of liveMediaFields(prior, old)) {
                  prompt = remapLiveMentionTokens(
                    prompt,
                    field,
                    readLiveMediaUrls(field, old[field.key]),
                    []
                  )
                  if (field.mentionSyntax)
                    prompt = prompt.replace(
                      new RegExp(`${field.mentionSyntax.prefix}\\d+\\b`, "g"),
                      ""
                    )
                }
              return {
                ...(data.model.defaults ?? {}),
                ...(record(data.model.inputSchema?.properties) &&
                "prompt" in data.model.inputSchema.properties
                  ? { prompt }
                  : {}),
              }
            })
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
  const effectiveSchema = current ? effectiveLiveSchema(current, values) : {}
  const mediaFields = current ? liveMediaFields(current, values) : []
  const totalReferences = mediaFields.reduce(
    (count, field) =>
      count + readLiveMediaUrls(field, values[field.key]).length,
    0
  )
  const mediaProblems = mediaFields.flatMap((field) => {
    const count = readLiveMediaUrls(field, values[field.key]).length
    return count < field.minItems &&
      (field.required || values[field.key] !== undefined)
      ? [
          `${field.name} requires at least ${field.minItems} ${field.kind} files.`,
        ]
      : field.maxItems !== null && count > field.maxItems
        ? [
            `${field.name} allows at most ${field.maxItems} ${field.kind} files.`,
          ]
        : []
  })
  if (totalReferences > LIVE_REFERENCE_APP_LIMIT)
    mediaProblems.push("The studio allows at most 60 references in total.")
  if (current) mediaProblems.push(...validateNativeMentions(current, values))
  const properties = record(effectiveSchema.properties)
    ? effectiveSchema.properties
    : {}
  const required = Array.isArray(effectiveSchema.required)
    ? (effectiveSchema.required as string[])
    : []
  const input = current
    ? {
        modelId: current.id,
        prompt: typeof values.prompt === "string" ? values.prompt : "",
        settings: { providerInput: values },
        media: [],
      }
    : null
  const subscription = pricing.mode === "subscription"
  const connected =
    subscription ||
    (selected.startsWith("or:")
      ? user?.openRouterConnected
      : user?.apiKeyConnected)
  const price = useApiPrice(
    input,
    !!connected &&
      !!current &&
      !current.stale &&
      !Object.keys(invalid).length &&
      !mediaProblems.length,
    user?.apiConnectionVersion
  )
  const usageKey = JSON.stringify({
    owner: user?.id,
    connection: user?.apiConnectionVersion,
    input,
    fingerprint: price.priceFingerprint,
  })
  const usageAccepted =
    price.status === "variable" &&
    price.allowUsagePrice === true &&
    acceptedUsageFor === usageKey
  const quoteReady =
    (price.status === "ready" && price.usd !== null) || usageAccepted
  const models = (catalog?.models ?? []).filter((m) => m.surface === surface)
  const visible = models.filter((m) =>
    `${m.label} ${m.family} ${m.id.startsWith("or:") ? "OpenRouter" : "Higgsfield"}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  const ordered = Object.entries(properties).sort(([a], [b]) =>
    a === "prompt" ? -1 : b === "prompt" ? 1 : 0
  )
  const library = [
    ...uploadState.uploads.map(uploadToLibraryItem),
    ...runs.records.flatMap(runToLibraryItems),
  ]
  const patch = (key: string, value: unknown, promptOverride?: string) =>
    setValues((old) => {
      const next = { ...old }
      const field = mediaFields.find((candidate) => candidate.key === key)
      if (field && typeof old.prompt === "string")
        next.prompt =
          promptOverride ??
          remapLiveMentionTokens(
            old.prompt,
            field,
            readLiveMediaUrls(field, old[key]),
            readLiveMediaUrls(field, value)
          )
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
    if (!run.modelId.startsWith("hf:") && !run.modelId.startsWith("or:")) {
      setValues((old) => ({ ...old, prompt: run.prompt }))
      setError(
        "Prompt reused. Choose a current API model and review its settings before generating."
      )
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
  const review = runs.records.find(
    (run) => run.modelId === selected && run.errorKind === "provider_review"
  )
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
    if (!connected) return
    if (
      !current ||
      !quoteReady ||
      submitting ||
      Object.keys(invalid).length ||
      mediaProblems.length
    )
      return
    setSubmitting(true)
    setError("")
    try {
      const outcome = await runs.submit({
        ...input!,
        submitKey: crypto.randomUUID(),
        expectedUsd: price.usd ?? undefined,
        acceptVariablePrice: usageAccepted,
        expectedPriceFingerprint: price.priceFingerprint,
        expectedCredits: price.credits,
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
      ? `${price.estimated ? "Est. " : ""}${subscription && price.credits != null ? price.credits.toLocaleString() + " credits" : formatUsd(price.usd)}`
      : price.status === "loading"
        ? "Pricing…"
        : price.status === "variable" && price.allowUsagePrice
          ? "Usage pricing"
          : "Price pending"
  const canvasView = canvasChoice ?? (items.length ? "history" : "how")
  const renderField = ([key, raw]: [string, unknown]) =>
    record(raw) ? (
      <LiveField
        key={`${current?.id}:${formRevision}:${key}`}
        name={key}
        schema={raw}
        required={required.includes(key)}
        value={values[key]}
        onChange={(value) => {
          const field = mediaFields.find((candidate) => candidate.key === key)
          patch(
            key,
            field && !field.required && !readLiveMediaUrls(field, value).length
              ? undefined
              : value
          )
        }}
        onError={(message) => fieldError(key, message)}
        library={library}
        signedIn={!!user}
        mediaField={mediaFields.find((field) => field.key === key)}
        totalReferences={totalReferences}
      />
    ) : null
  const settings = ordered.filter(([key]) => key !== "prompt")
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col p-2 md:p-4 md:pt-2">
      <section
        className="studio-backdrop relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-white/10"
        aria-label="Results"
      >
        <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 px-3">
          <div
            role="tablist"
            aria-label="Canvas view"
            className="flex items-center gap-1"
          >
            {(
              [
                ["history", "History", FolderClosed],
                ["how", "How it works", BookOpen],
              ] as const
            ).map(([view, label, Icon]) => (
              <button
                type="button"
                key={view}
                role="tab"
                aria-selected={canvasView === view}
                onClick={() => setCanvasChoice(view)}
                className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs ${canvasView === view ? "bg-white/[0.08] text-white" : "text-white/50"}`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-white/50 hover:text-white"
            aria-label="Refresh model catalog"
          >
            <RefreshCw className="size-3.5" />
            <span className="hidden sm:inline">{models.length} models</span>
          </button>
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          style={{ paddingBottom: dockHeight + 16 }}
        >
          {canvasView === "how" ? (
            <HowItWorks surface={surface} tab="create" />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col px-3">
              <UserGenerations
                items={items}
                title={<span className="text-sm">Your generations</span>}
                actions={(item) =>
                  actions(item).filter((action) => action.id !== "template")
                }
                hasMore={runs.hasMore}
                loadingMore={runs.loadingMore}
                onLoadMore={runs.loadMore}
                emptyState={<HowItWorks surface={surface} tab="create" />}
              />
            </div>
          )}
        </div>
      </section>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-3 md:px-6 md:pb-6">
        <div
          ref={dockRef}
          className="pointer-events-auto w-full max-w-[1120px]"
        >
          {(error ||
            runs.error ||
            review ||
            current?.stale ||
            catalog?.stale) && (
            <div
              className="mx-3 mb-2 max-h-24 overflow-y-auto rounded-xl border border-white/10 bg-page px-3 py-2 text-xs text-amber-200"
              role="status"
            >
              {error ||
                runs.error ||
                (review
                  ? "An earlier request needs provider review. Check its usage before retrying."
                  : current?.stale
                    ? "Refresh the model schema before generating."
                    : "Showing saved catalog data while the provider refreshes.")}
            </div>
          )}
          <PromptBox.Root
            surface="glass"
            className="w-full"
            aria-label={`${surface === "image" ? "Image" : "Video"} generation controls`}
          >
            <PromptBox.Body>
              {current ? (
                <LiveReferencePrompt
                  key={current.id}
                  fields={mediaFields}
                  values={values}
                  prompt={
                    typeof values.prompt === "string" ? values.prompt : ""
                  }
                  onPromptChange={(value) => patch("prompt", value)}
                  onFieldChange={patch}
                  library={library}
                  signedIn={!!user}
                  onSignIn={() => openAuth({ mode: "signup" })}
                  maxLength={
                    record(properties.prompt) &&
                    typeof properties.prompt.maxLength === "number"
                      ? properties.prompt.maxLength
                      : undefined
                  }
                  onGenerate={() => void generate()}
                />
              ) : (
                <p className="flex items-center gap-2 p-3 text-sm text-white/50">
                  <Loader2 className="size-4 animate-spin" />
                  Loading model inputs…
                </p>
              )}
              <PromptBox.Actions className="flex-wrap">
                <Dialog
                  open={modelPickerOpen}
                  onOpenChange={setModelPickerOpen}
                >
                  <DialogTrigger
                    render={
                      <PromptBox.Pill
                        aria-label={`Model: ${current?.label ?? "Choose a model"}`}
                        start={surface === "image" ? <ImageIcon /> : <Film />}
                        end={<ChevronDown />}
                        className="max-w-[min(270px,65vw)]"
                      >
                        <span className="truncate">
                          {current?.label ?? "Choose a model"}
                        </span>
                      </PromptBox.Pill>
                    }
                  />
                  <DialogContent size="xl">
                    <DialogHeader>
                      <DialogTitle>
                        Choose {surface === "image" ? "an image" : "a video"}{" "}
                        model
                      </DialogTitle>
                      <DialogDescription>
                        All currently discovered compatible API modes. Settings
                        follow the selected model.
                      </DialogDescription>
                    </DialogHeader>
                    <label className="flex items-center gap-2 rounded-xl border border-white/10 px-3">
                      <Search className="size-4 text-white/50" />
                      <input
                        className="min-h-11 w-full min-w-0 bg-transparent text-sm outline-none"
                        aria-label="Find a model"
                        placeholder="Search name, family or provider"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                    <DialogBody>
                      <div className="grid max-h-[55dvh] gap-2 overflow-y-auto sm:grid-cols-2">
                        {visible.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            aria-pressed={selected === model.id}
                            onClick={() => {
                              setSelected(model.id)
                              setError("")
                              setSearch("")
                              setModelPickerOpen(false)
                            }}
                            className={`min-w-0 rounded-xl border p-3 text-left ${selected === model.id ? "border-lime bg-lime/10" : "border-white/10 bg-white/[.03] hover:bg-white/[.07]"}`}
                          >
                            <span className="block text-sm font-medium">
                              {model.label}
                            </span>
                            <span className="mt-1 block text-xs text-white/50">
                              {model.id.startsWith("or:")
                                ? "OpenRouter"
                                : "Higgsfield"}{" "}
                              · {model.family}
                            </span>
                          </button>
                        ))}
                        {!visible.length && (
                          <p className="p-4 text-sm text-white/50">
                            No models match this search.
                          </p>
                        )}
                      </div>
                    </DialogBody>
                  </DialogContent>
                </Dialog>
                <Dialog>
                  <DialogTrigger
                    render={
                      <PromptBox.Pill
                        start={<SlidersHorizontal />}
                        aria-label="Model settings"
                        disabled={!current}
                      >
                        Settings
                      </PromptBox.Pill>
                    }
                  />
                  <DialogContent size="md">
                    <DialogHeader>
                      <DialogTitle>{current?.label} settings</DialogTitle>
                      <DialogDescription>
                        Inputs and limits come from this model&apos;s current
                        schema.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogBody>
                      <div className="grid max-h-[60dvh] gap-5 overflow-y-auto pr-1">
                        {settings.map(renderField)}
                        {!settings.length && (
                          <p className="text-sm text-white/50">
                            This model has no additional settings.
                          </p>
                        )}
                      </div>
                    </DialogBody>
                  </DialogContent>
                </Dialog>
                <span className="ml-auto hidden text-[11px] text-white/40 sm:inline">
                  {catalog
                    ? `${models.length} models · ${catalog.stale ? "saved catalog" : "catalog updated"}`
                    : "Loading catalog"}
                </span>
              </PromptBox.Actions>
            </PromptBox.Body>
            <PromptBox.Generate
              cost={user && connected ? priceLabel : undefined}
              disabled={
                !!user &&
                connected &&
                (!quoteReady ||
                  submitting ||
                  !current ||
                  current.stale ||
                  !!Object.keys(invalid).length ||
                  !!mediaProblems.length ||
                  !!review)
              }
              onClick={() => {
                if (!user) openAuth({ mode: "signup" })
                else if (!connected) router.push("/account")
                else void generate()
              }}
            >
              {!user
                ? "Sign in"
                : !connected
                  ? "Connect key"
                  : submitting
                    ? "Submitting…"
                    : "Generate"}
            </PromptBox.Generate>
          </PromptBox.Root>
          {price.status === "variable" && price.allowUsagePrice && (
            <label className="mx-3 flex items-start gap-2 rounded-lg bg-page px-3 py-2 text-xs text-white/70">
              <input
                type="checkbox"
                className="mt-0.5 accent-lime"
                checked={usageAccepted}
                onChange={(event) =>
                  setAcceptedUsageFor(event.target.checked ? usageKey : "")
                }
              />
              I accept usage-based billing from my OpenRouter account. The exact
              total is reported after generation.
            </label>
          )}
          {!!mediaProblems.length && (
            <p
              className="mx-3 mt-1 rounded-lg bg-page px-3 py-2 text-xs text-amber-200"
              role="status"
            >
              {mediaProblems.join(" ")}
            </p>
          )}
          {(price.error || price.explanation) && (
            <p
              className="mx-3 mt-1 text-center text-[11px] text-white/50"
              role="status"
            >
              {price.error || price.explanation}
            </p>
          )}
        </div>
      </div>
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
  mediaField,
  totalReferences,
}: {
  name: string
  schema: Json
  required: boolean
  value: unknown
  onChange: (value: unknown) => void
  onError: (message: string) => void
  library: AssetLibraryItem[]
  signedIn: boolean
  mediaField?: LiveMediaField
  totalReferences: number
}) {
  const label =
    typeof schema.title === "string" ? schema.title : name.replaceAll("_", " ")
  const type = Array.isArray(schema.type)
    ? schema.type.find((t) => t !== "null")
    : schema.type
  const isArray = mediaField?.array ?? type === "array"
  const mediaKind = mediaField?.kind
  const media = !!mediaField
  const [uploading, setUploading] = useState(false)
  const [localError, setLocalError] = useState("")
  const urls = mediaField ? readLiveMediaUrls(mediaField, value) : []
  const effectiveMax = mediaField
    ? Math.max(
        0,
        Math.min(
          mediaField.maxItems ?? LIVE_REFERENCE_APP_LIMIT,
          LIVE_REFERENCE_APP_LIMIT - (totalReferences - urls.length)
        )
      )
    : 0
  const remaining = isArray
    ? Math.max(0, effectiveMax - urls.length)
    : effectiveMax
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
          {required || mediaField?.required ? " *" : ""} · {urls.length}/
          {mediaField?.maxItems ?? "provider max unspecified"}
        </span>
        {mediaField?.maxItems === null && (
          <p className="text-[11px] text-white/40">
            Provider maximum not published. Studio safety limit: 60 total
            references.
          </p>
        )}
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
                    encodeLiveMediaUrls(
                      mediaField!,
                      urls.filter((src) => src !== item.src)
                    )
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
            items={library}
            accept={[mediaKind!]}
            maxSelections={Math.max(1, remaining)}
            excludeIds={isArray ? urls : []}
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
              const selected = isArray
                ? [
                    ...urls,
                    ...picked
                      .filter((item) => item.kind === mediaKind)
                      .map((item) => item.src),
                  ]
                    .filter(
                      (url, index, all) =>
                        all.findIndex(
                          (candidate) =>
                            referenceIdentity(candidate) ===
                            referenceIdentity(url)
                        ) === index
                    )
                    .slice(0, effectiveMax)
                : picked.slice(0, 1).map((item) => item.src)
              onChange(encodeLiveMediaUrls(mediaField!, selected))
            }}
            trigger={
              <button
                disabled={uploading || !remaining}
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
