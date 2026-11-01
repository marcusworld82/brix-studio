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
import { familyCover } from "@/lib/showcase"
import {
  liveFieldDisplay,
  orderLiveFields,
  visibleFieldErrors,
  mediaLimitMessage,
} from "./live-field-display"
import { videoWorkflow, workflowModel } from "./video-workflow"
import { validateLiveShotTimeline } from "@/generation/catalog/shot-timeline"
import {
  effectiveLiveSchema,
  liveMediaFields,
  readLiveMediaUrls,
  encodeLiveMediaUrls,
  type LiveMediaField,
  LIVE_REFERENCE_APP_LIMIT,
  remapLiveMentionTokens,
  validateNativeMentions,
  liveMentionToken,
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
  }, [surface])
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
    const label = current
      ? liveFieldDisplay(current, field.key, field.raw, values).label
      : field.name
    return count < field.minItems &&
      values[field.key] !== null &&
      (field.required || values[field.key] !== undefined)
      ? [mediaLimitMessage(label, field.kind, field.minItems, "minimum")]
      : field.maxItems !== null && count > field.maxItems
        ? [mediaLimitMessage(label, field.kind, field.maxItems, "maximum")]
        : []
  })
  if (totalReferences > LIVE_REFERENCE_APP_LIMIT)
    mediaProblems.push("The studio allows at most 60 references in total.")
  if (current)
    mediaProblems.push(
      ...validateNativeMentions(current, values),
      ...validateLiveShotTimeline(current, values)
    )
  const properties = record(effectiveSchema.properties)
    ? effectiveSchema.properties
    : {}
  const required = Array.isArray(effectiveSchema.required)
    ? (effectiveSchema.required as string[])
    : []
  const relevantInvalid = current
    ? visibleFieldErrors(current, values, properties, invalid)
    : invalid
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
    !!user &&
      !!connected &&
      !!current &&
      !current.stale &&
      !Object.keys(relevantInvalid).length &&
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
  const ordered = current
    ? orderLiveFields(current, properties).filter(
        ([key, raw]) =>
          !record(raw) || !liveFieldDisplay(current, key, raw, values).hidden
      )
    : []
  const visibleMediaFields = mediaFields
    .filter(
      (field) =>
        current &&
        !liveFieldDisplay(current, field.key, field.raw, values).hidden
    )
    .map((field) => ({
      ...field,
      name: liveFieldDisplay(current!, field.key, field.raw, values).label,
    }))
  const library = [
    ...uploadState.uploads.map(uploadToLibraryItem),
    ...runs.records.flatMap(runToLibraryItems),
  ]
  const patch = (key: string, value: unknown, promptOverride?: string) => {
    const disablingShots = key === "multi_shots" && value === false
    if (current) {
      const prospective = { ...values, [key]: value }
      if (disablingShots) delete prospective.multi_prompt
      const nextSchema = effectiveLiveSchema(current, prospective)
      const nextProperties = record(nextSchema.properties)
        ? nextSchema.properties
        : {}
      setInvalid((old) => {
        const next = visibleFieldErrors(
          current,
          prospective,
          nextProperties,
          old
        )
        if (disablingShots) delete next.multi_prompt
        return Object.keys(next).length === Object.keys(old).length ? old : next
      })
    }
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
      if (disablingShots) delete next.multi_prompt
      if (
        key === "multi_prompt" &&
        record(properties.multi_shots) &&
        properties.multi_shots.type === "boolean"
      )
        next.multi_shots = Array.isArray(value) && value.length > 0
      return next
    })
  }
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
      Object.keys(relevantInvalid).length ||
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
  const renderField = (
    [key, raw]: [string, unknown],
    compact = false,
    mediaButtonOnly = false
  ) =>
    record(raw) ? (
      <LiveField
        key={`${current?.id}:${formRevision}:${key}`}
        name={key}
        schema={{
          ...raw,
          title: current
            ? liveFieldDisplay(current, key, raw, values).label
            : raw.title,
        }}
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
        compact={compact}
        mediaButtonOnly={mediaButtonOnly}
        onSignIn={() => openAuth({ mode: "signup" })}
        shotTotal={
          current?.path.startsWith("kling-video/v3.0/") &&
          typeof values.duration === "number"
            ? values.duration
            : undefined
        }
      />
    ) : null
  const settings = ordered.filter(([key]) => key !== "prompt")
  const mediaSettings = settings.filter(([key]) =>
    mediaFields.some((field) => field.key === key)
  )
  const parameterSettings = settings.filter(
    ([key]) => !mediaFields.some((field) => field.key === key)
  )
  const primaryKeys =
    /^(aspect_ratio|aspectRatio|resolution|quality|size|n|num_images|num_outputs|batch_size|batchSize|output_format|enhance_prompt|generate_audio|audio)$/i
  const primarySettings = parameterSettings.filter(
    ([key, raw]) =>
      primaryKeys.test(key) ||
      (required.includes(key) &&
        record(raw) &&
        ["number", "integer", "boolean"].includes(String(raw.type)))
  )
  const advancedSettings = parameterSettings.filter(
    (field) => !primarySettings.includes(field)
  )
  const modelPicker = (
    <Dialog open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
      <DialogTrigger
        render={
          surface === "video" ? (
            <button
              type="button"
              aria-label={`Model: ${current?.label ?? "Choose a model"}`}
              className="relative h-20 w-full shrink-0 overflow-hidden rounded-xl bg-surface text-left"
            >
              {current && (
                <Image
                  unoptimized
                  fill
                  sizes="320px"
                  src={
                    current.previewImage ?? familyCover(current.family, surface)
                  }
                  alt=""
                  className="object-cover"
                />
              )}
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/75 px-3 py-2 text-xs font-medium">
                <span className="min-w-0 flex-1 truncate">
                  {current?.label ?? "Choose a model"}
                </span>
                <ChevronDown className="size-4 shrink-0" />
              </span>
            </button>
          ) : (
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
          )
        }
      />
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            Choose {surface === "image" ? "an image" : "a video"} model
          </DialogTitle>
          <DialogDescription>
            All currently discovered compatible API modes. Settings follow the
            selected model.
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
                <span className="block text-sm font-medium">{model.label}</span>
                <span className="mt-1 block text-xs text-white/50">
                  {model.id.startsWith("or:") ? "OpenRouter" : "Higgsfield"} ·{" "}
                  {model.family}
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
  )
  const promptControl = current ? (
    <LiveReferencePrompt
      key={`prompt:${current.id}`}
      showAttached={surface === "image"}
      rows={surface === "video" ? 3 : 2}
      pickerInline={surface === "video"}
      fields={visibleMediaFields}
      values={values}
      prompt={typeof values.prompt === "string" ? values.prompt : ""}
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
  )
  const generateControl = (
    <PromptBox.Generate
      cost={user && connected ? priceLabel : undefined}
      disabled={
        !!user &&
        connected &&
        (!quoteReady ||
          submitting ||
          !current ||
          current.stale ||
          !!Object.keys(relevantInvalid).length ||
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
  )
  const feedback = (
    <>
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
    </>
  )
  const alerts = (
    <>
      {(error || runs.error || review || current?.stale || catalog?.stale) && (
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
    </>
  )
  const canvas = (
    <section
      className={`studio-backdrop relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-white/10 ${surface === "video" ? "min-h-[420px] shrink-0 md:min-h-0 md:shrink" : "min-h-0"}`}
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
        style={{ paddingBottom: surface === "video" ? 16 : dockHeight + 16 }}
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
  )
  return surface === "video" ? (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto p-2 md:flex-row md:gap-4 md:overflow-hidden md:p-4 md:pt-2">
      <aside
        className="studio-backdrop flex w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 md:w-[320px]"
        aria-label="Video generation controls"
      >
        <div
          className="flex shrink-0 gap-1 border-b border-white/10 p-2"
          role="group"
          aria-label="Video workflow"
        >
          {(
            [
              ["create", "Create Video"],
              ["edit", "Edit Video"],
              ["motion", "Motion Control"],
            ] as const
          ).map(([workflow, label]) => (
            <button
              type="button"
              key={workflow}
              disabled={!workflowModel(models, workflow, current?.family)}
              aria-pressed={
                !!current && videoWorkflow(current.path) === workflow
              }
              onClick={() => {
                const model = workflowModel(models, workflow, current?.family)
                if (model && model.id !== selected) {
                  setSelected(model.id)
                  setError("")
                }
              }}
              className={`min-h-9 min-w-0 flex-1 rounded-lg px-1 text-[11px] disabled:opacity-30 ${current && videoWorkflow(current.path) === workflow ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex min-h-8 shrink-0 items-center border-b border-white/10 px-4">
          <h1 className="text-sm font-semibold">
            {current && videoWorkflow(current.path) === "edit"
              ? "Edit video"
              : current && videoWorkflow(current.path) === "motion"
                ? "Motion control"
                : "Video studio"}
          </h1>
          <span className="ml-auto text-[11px] text-white/40">
            {models.length} models
          </span>
        </div>
        <div className="flex flex-col gap-3 p-3 md:min-h-0 md:flex-1 md:overflow-y-auto">
          {modelPicker}
          {!!mediaSettings.length && (
            <section
              className="grid grid-cols-2 gap-3"
              aria-label="Video reference inputs"
            >
              {mediaSettings.map((field) => (
                <div
                  key={field[0]}
                  className={
                    mediaFields.find((media) => media.key === field[0])
                      ?.array ||
                    mediaFields.find((media) => media.key === field[0])
                      ?.kind !== "image"
                      ? "col-span-2 min-w-0"
                      : "min-w-0"
                  }
                >
                  {renderField(field, true)}
                </div>
              ))}
            </section>
          )}
          <section
            className="rounded-xl border border-white/10 bg-white/[.03] p-2"
            aria-label="Video prompt"
          >
            <h2 className="mb-2 text-xs text-white/60">Prompt</h2>
            {promptControl}
          </section>
          <section
            className="grid grid-cols-2 items-start gap-3"
            aria-label="Video model parameters"
          >
            {parameterSettings
              .filter(
                ([key]) =>
                  key !== "multi_prompt" ||
                  values.multi_shots !== false ||
                  (Array.isArray(values.multi_prompt) &&
                    values.multi_prompt.length > 0)
              )
              .map((field) => (
                <div
                  className={
                    record(field[1]) &&
                    (["object", "array"].includes(String(field[1].type)) ||
                      field[0].includes("prompt"))
                      ? "col-span-2 min-w-0"
                      : "min-w-0"
                  }
                  key={field[0]}
                >
                  {renderField(field, true)}
                </div>
              ))}
          </section>
          {alerts}
        </div>
        <div className="sticky bottom-0 z-10 shrink-0 border-t border-white/10 bg-page p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [&_.q-prompt-box-generate]:h-12 [&_.q-prompt-box-generate]:min-h-12 [&_.q-prompt-box-generate]:w-full [&_.q-prompt-box-generate]:flex-row [&_.q-prompt-box-generate]:gap-3 [&_.q-prompt-box-generate]:p-3">
          {generateControl}
          {feedback}
        </div>
      </aside>
      {canvas}
      {dialogs}
    </div>
  ) : (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col p-2 md:p-4 md:pt-2">
      {canvas}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-3 md:px-6 md:pb-6">
        <div
          ref={dockRef}
          className="pointer-events-auto w-full max-w-[1120px]"
        >
          {alerts}
          <PromptBox.Root
            surface="glass"
            className="w-full"
            aria-label="Image generation controls"
          >
            <PromptBox.Body>
              {promptControl}
              <PromptBox.Actions className="flex-wrap items-end">
                {modelPicker}
                {mediaSettings.map((field) => (
                  <div key={`upload:${field[0]}`} className="min-w-0">
                    {renderField(field, true, true)}
                  </div>
                ))}
                {primarySettings.map((field) => (
                  <div className="max-w-[170px] min-w-0" key={field[0]}>
                    {renderField(field, true)}
                  </div>
                ))}
              </PromptBox.Actions>
              {!!advancedSettings.length && (
                <details
                  key={`advanced:${current?.id}`}
                  className="min-w-0 border-t border-white/5 pt-2"
                >
                  <summary className="w-fit cursor-pointer text-[11px] text-white/50">
                    More controls ({advancedSettings.length})
                  </summary>
                  <div className="mt-2 flex max-h-[22dvh] flex-wrap items-start gap-3 overflow-y-auto">
                    {advancedSettings.map((field) => (
                      <div className="max-w-full min-w-0" key={field[0]}>
                        {renderField(field, true)}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </PromptBox.Body>
            {generateControl}
          </PromptBox.Root>
          {feedback}
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
  compact = false,
  mediaButtonOnly = false,
  onSignIn,
  shotTotal,
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
  compact?: boolean
  mediaButtonOnly?: boolean
  onSignIn: () => void
  shotTotal?: number
}) {
  const inputClass = compact
    ? "w-full min-w-0 rounded-lg bg-transparent px-1 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-lime"
    : fieldClass
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
  const selectMedia = (
    picked: import("@/lib/studio/uploads").AssetSelection[]
  ) => {
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
                  referenceIdentity(candidate) === referenceIdentity(url)
              ) === index
          )
          .slice(0, effectiveMax)
      : picked.slice(0, 1).map((item) => item.src)
    onChange(encodeLiveMediaUrls(mediaField!, selected))
  }
  if (media && mediaButtonOnly) {
    const count = `${urls.length}/${mediaField!.maxItems ?? `${LIVE_REFERENCE_APP_LIMIT} studio`}`
    const trigger = (
      <PromptBox.Pill
        start={<Plus />}
        disabled={signedIn && !remaining}
        aria-label={`Add ${label}, ${count}`}
        title={
          mediaField!.maxItems === null
            ? `Provider maximum not published. Studio safety limit: ${LIVE_REFERENCE_APP_LIMIT} total references.`
            : `${label}: ${count}`
        }
        onClick={signedIn ? undefined : onSignIn}
      >
        {label} <span className="text-white/45">{count}</span>
      </PromptBox.Pill>
    )
    return signedIn ? (
      <AssetLibraryModal
        items={library}
        accept={[mediaKind!]}
        maxSelections={Math.max(1, remaining)}
        excludeIds={isArray ? urls : []}
        onUpload={uploadAsset}
        onSelectMany={selectMedia}
        trigger={trigger}
      />
    ) : (
      trigger
    )
  }
  if (media) {
    const selections = urls.map((src, index) => ({
      id: src,
      src,
      kind: mediaKind!,
      name: `${label} ${index + 1}`,
    }))
    return (
      <div
        className={`flex min-w-0 flex-col gap-2 ${compact ? "max-w-full rounded-xl bg-white/[.03] p-2" : ""}`}
      >
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
        <div className="flex max-w-full flex-wrap gap-2">
          {selections.map((item) => (
            <span
              className={`relative block shrink-0 overflow-hidden rounded-lg border border-white/10 ${compact ? "size-16" : "size-24"}`}
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
              <span className="absolute bottom-0 left-0 rounded-tr bg-black/80 px-1 text-[10px] text-white/80">
                {liveMentionToken(mediaField!, urls.indexOf(item.src)) ??
                  urls.indexOf(item.src) + 1}
              </span>
              {isArray && urls.length > 1 && (
                <div className="absolute right-0 bottom-0 flex bg-black/80">
                  {([-1, 1] as const).map((direction) => (
                    <button
                      type="button"
                      key={direction}
                      className="flex size-7 items-center justify-center text-xs text-white disabled:opacity-30"
                      disabled={
                        urls.indexOf(item.src) + direction < 0 ||
                        urls.indexOf(item.src) + direction >= urls.length
                      }
                      aria-label={`Move ${item.name} ${direction < 0 ? "earlier" : "later"}`}
                      onClick={() => {
                        const next = [...urls]
                        const index = urls.indexOf(item.src)
                        ;[next[index], next[index + direction]] = [
                          next[index + direction],
                          next[index],
                        ]
                        onChange(encodeLiveMediaUrls(mediaField!, next))
                      }}
                    >
                      {direction < 0 ? "←" : "→"}
                    </button>
                  ))}
                </div>
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
            onSelectMany={selectMedia}
            trigger={
              <button
                disabled={uploading || !remaining}
                className={`${fieldClass} flex ${compact ? "min-h-12" : "min-h-20"} items-center justify-center gap-2 border-dashed`}
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
          <button
            type="button"
            className={`${fieldClass} flex ${compact ? "min-h-12" : "min-h-20"} items-center justify-center gap-2 border-dashed text-white/60`}
            onClick={onSignIn}
          >
            <Plus className="size-4" />
            Add {mediaKind}
            {isArray ? " references" : ""}
          </button>
        )}
        {localError ? (
          <p className="text-xs text-red-300" role="alert">
            {localError}
          </p>
        ) : null}
        {!compact && typeof schema.description === "string" ? (
          <p className="text-[11px] leading-relaxed text-white/40">
            {schema.description}
          </p>
        ) : null}
      </div>
    )
  }
  if (
    type === "array" &&
    record(schema.items) &&
    record(schema.items.properties) &&
    record(schema.items.properties.prompt) &&
    record(schema.items.properties.duration)
  )
    return (
      <ShotField
        label={label}
        schema={schema}
        value={value}
        onChange={onChange}
        onError={onError}
        totalDuration={shotTotal}
      />
    )
  if (compact && type === "boolean")
    return (
      <label className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/5 px-3 text-xs text-white/70">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 accent-lime"
        />
        <span>{label}</span>
      </label>
    )
  const content = Array.isArray(schema.enum) ? (
    <select
      className={inputClass}
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
      className={inputClass}
      type="number"
      step={
        typeof schema.multipleOf === "number"
          ? schema.multipleOf
          : type === "integer"
            ? 1
            : typeof schema.minimum === "number" &&
                typeof schema.maximum === "number" &&
                schema.minimum >= 0 &&
                schema.maximum <= 1
              ? 0.01
              : "any"
      }
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
        className={`${inputClass} min-h-24 resize-y`}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={required ? "Required" : "Optional"}
      />
    ) : (
      <input
        className={inputClass}
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
    <label
      title={
        typeof schema.description === "string" ? schema.description : undefined
      }
      className={`flex min-w-0 flex-col text-white/70 ${compact ? "gap-0.5 rounded-xl bg-white/5 px-2 py-1 text-[11px]" : "gap-1.5 text-xs"}`}
    >
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      {content}
      {!compact && typeof schema.description === "string" ? (
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

/** Native shot objects, with every bound read from the selected model schema. */
function ShotField({
  label,
  schema,
  value,
  onChange,
  onError,
  totalDuration,
}: {
  label: string
  schema: Json
  value: unknown
  onChange: (value: unknown) => void
  onError: (value: string) => void
  totalDuration?: number
}) {
  const items = record(schema.items) ? schema.items : {}
  const properties = record(items.properties) ? items.properties : {}
  const prompt = record(properties.prompt) ? properties.prompt : {}
  const duration = record(properties.duration) ? properties.duration : {}
  const shots = Array.isArray(value) ? value.filter(record) : []
  const max = typeof schema.maxItems === "number" ? schema.maxItems : null
  const minimum =
    typeof duration.minimum === "number" ? duration.minimum : undefined
  const maximum =
    typeof duration.maximum === "number" ? duration.maximum : undefined
  function commit(next: Json[]) {
    const message = next.some(
      (shot) =>
        typeof shot.prompt !== "string" ||
        !shot.prompt.trim() ||
        (typeof prompt.maxLength === "number" &&
          shot.prompt.length > prompt.maxLength) ||
        typeof shot.duration !== "number" ||
        !Number.isFinite(shot.duration) ||
        (minimum !== undefined && shot.duration < minimum) ||
        (maximum !== undefined && shot.duration > maximum)
    )
      ? "Give each shot a prompt and a duration within this model's limits."
      : ""
    onError(message)
    onChange(next.length ? next : undefined)
  }
  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border border-white/10 p-3">
      <legend className="px-1 text-xs text-white/70">
        {label}
        {max !== null ? ` · ${shots.length}/${max} shots` : ""}
      </legend>
      {shots.map((shot, index) => (
        <div
          className="min-w-0 space-y-2 rounded-lg bg-black/20 p-2"
          key={index}
        >
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span>Shot {index + 1}</span>
            <button
              type="button"
              className="min-h-7 px-1 text-white/60"
              aria-label={`Remove shot ${index + 1}`}
              onClick={() => commit(shots.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
          <label className="block text-[11px] text-white/60">
            Shot {index + 1} prompt
            <textarea
              rows={2}
              maxLength={
                typeof prompt.maxLength === "number"
                  ? prompt.maxLength
                  : undefined
              }
              value={typeof shot.prompt === "string" ? shot.prompt : ""}
              onChange={(event) =>
                commit(
                  shots.map((item, i) =>
                    i === index ? { ...item, prompt: event.target.value } : item
                  )
                )
              }
              className={`${fieldClass} mt-1 resize-y`}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-[11px] text-white/60">
            Duration, seconds
            <input
              type="number"
              min={minimum}
              max={maximum}
              step={duration.type === "integer" ? 1 : "any"}
              value={typeof shot.duration === "number" ? shot.duration : ""}
              onChange={(event) =>
                commit(
                  shots.map((item, i) =>
                    i === index
                      ? {
                          ...item,
                          duration:
                            event.target.value === ""
                              ? undefined
                              : Number(event.target.value),
                        }
                      : item
                  )
                )
              }
              aria-label={`Shot ${index + 1} duration`}
              className={`${fieldClass} max-w-24`}
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        className="flex min-h-9 items-center gap-2 rounded-lg bg-white/5 px-3 text-xs text-white/70 disabled:opacity-30"
        disabled={max !== null && shots.length >= max}
        onClick={() =>
          commit([
            ...shots,
            {
              prompt: "",
              duration:
                typeof duration.default === "number"
                  ? duration.default
                  : (minimum ?? 0),
            },
          ])
        }
      >
        <Plus className="size-3" />
        Add shot
      </button>
      <p className="text-[11px] leading-relaxed text-white/40">
        {totalDuration !== undefined
          ? `Shots: ${shots.reduce((sum, shot) => sum + (typeof shot.duration === "number" ? shot.duration : 0), 0)} of ${totalDuration} seconds. Shot lengths should add up to the selected duration.`
          : `Shot lengths use this model's limits${minimum !== undefined && maximum !== undefined ? `: ${minimum}–${maximum} seconds each` : ""}.`}
      </p>
    </fieldset>
  )
}
