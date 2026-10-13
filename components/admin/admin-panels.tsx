"use client"

/* eslint-disable @next/next/no-img-element */
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react"

import {
  adjustCreditsAction,
  clearBillingFlagAction,
  deletePresetAction,
  deleteTemplateAdminAction,
  moderateAction,
  setModelEnabledAction,
  setPriceOverrideAction,
  upsertPresetAction,
  upsertTemplateAction,
} from "@/app/actions/admin"
import { ConfirmDialog } from "@/components/generator/tile-actions"
import { useToast } from "@/components/providers/app-providers"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type {
  AdminGenerationRow,
  AdminModelRow,
  AdminUserRow,
  ModerationItem,
} from "@/lib/admin"
import type { PriceRule } from "@/lib/billing/pricing-types"
import { uploadMedia } from "@/generation/upload"
import type { PresetView } from "@/lib/presets"
import type { TemplateView } from "@/lib/templates"
import { cn } from "@/lib/utils"

const input =
  "h-9 rounded-lg border border-white/10 bg-surface px-3 text-sm outline-none focus:border-lime/50"

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/5">
      <table className="w-full min-w-[720px] text-sm">{children}</table>
    </div>
  )
}

function Th({
  children,
  right,
}: {
  children?: React.ReactNode
  right?: boolean
}) {
  return (
    <th
      scope="col"
      className={cn(
        "bg-surface px-3 py-2.5 text-xs font-medium text-muted-foreground",
        right ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  )
}

/* ── Users ─────────────────────────────────────────────────────────────── */

export function AdminUsers({
  query,
  rows,
}: {
  query: string
  rows: AdminUserRow[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [target, setTarget] = useState<AdminUserRow | null>(null)
  return (
    <section className="flex flex-col gap-4">
      <form className="flex gap-2" action="/admin">
        <input type="hidden" name="tab" value="users" />
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by email prefix or user id"
          aria-label="Search users"
          className={cn(input, "flex-1")}
        />
        <Button type="submit">Search</Button>
      </form>
      <Table>
        <thead>
          <tr>
            <Th>Email</Th>
            <Th>Plan</Th>
            <Th right>Plan credits</Th>
            <Th right>Top-up</Th>
            <Th right>Generations</Th>
            <Th>Joined</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-white/5">
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2">
                  {row.email}
                  {row.role === "admin" ? (
                    <span className="rounded bg-lime/15 px-1.5 text-xs text-lime">
                      admin
                    </span>
                  ) : null}
                  {row.billingFlag ? (
                    <button
                      type="button"
                      title={row.billingFlag}
                      aria-label={`Billing flag: ${row.billingFlag}. Clear flag`}
                      onClick={async () => {
                        const result = await clearBillingFlagAction(row.id)
                        if (result.ok) router.refresh()
                      }}
                      className="text-pink"
                    >
                      <AlertTriangle className="size-4" />
                    </button>
                  ) : null}
                </span>
              </td>
              <td className="px-3 py-2.5 capitalize">{row.plan}</td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {row.credits.subscription}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {row.credits.topup}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {row.generations}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {new Date(row.createdAt).toLocaleDateString()}
              </td>
              <td className="px-3 py-2.5 text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTarget(row)}
                >
                  Adjust credits
                </Button>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-3 py-6 text-center text-muted-foreground"
              >
                No users found.
              </td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      <AdjustDialog
        user={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          toast.success("Credits adjusted")
          router.refresh()
        }}
      />
    </section>
  )
}

function AdjustDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserRow | null
  onClose: () => void
  onDone: () => void
}) {
  const [bucket, setBucket] = useState<"topup" | "subscription">("topup")
  const [delta, setDelta] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    setPending(true)
    setError(null)
    const result = await adjustCreditsAction({
      userId: user.id,
      bucket,
      delta: Number(delta),
      note,
    })
    setPending(false)
    if (!result.ok) return setError(result.error)
    setDelta("")
    setNote("")
    onClose()
    onDone()
  }
  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Adjust credits</DialogTitle>
            <DialogDescription>
              {user?.email} — recorded in the ledger as an admin adjustment.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Bucket
                <select
                  value={bucket}
                  onChange={(event) =>
                    setBucket(event.target.value as typeof bucket)
                  }
                  className={input}
                >
                  <option value="topup">Top-up (never expires)</option>
                  <option value="subscription">Plan credits</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Amount (negative to remove)
                <input
                  type="number"
                  required
                  value={delta}
                  onChange={(event) => setDelta(event.target.value)}
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Note (visible to the user)
                <input
                  required
                  minLength={3}
                  maxLength={200}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className={input}
                />
              </label>
              {error ? (
                <p role="alert" className="text-sm text-[#ff6b6b]">
                  {error}
                </p>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Generations ───────────────────────────────────────────────────────── */

const STATUS_TONE: Record<string, string> = {
  completed: "text-lime",
  failed: "text-[#ff6b6b]",
  nsfw: "text-pink",
  canceled: "text-muted-foreground",
}

export function AdminGenerations({
  status,
  modelId,
  models,
  page,
}: {
  status: string
  modelId: string
  models: { id: string; label: string }[]
  page: { items: AdminGenerationRow[]; nextCursor: string | null }
}) {
  const router = useRouter()
  const navigate = (next: Record<string, string>) => {
    const params = new URLSearchParams({
      tab: "generations",
      status,
      model: modelId,
      ...next,
    })
    for (const [key, value] of [...params.entries()])
      if (!value) params.delete(key)
    router.push(`/admin?${params.toString()}`)
  }
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Status"
          value={status}
          onChange={(event) =>
            navigate({ status: event.target.value, cursor: "" })
          }
          className={input}
        >
          {[
            "all",
            "pending_submit",
            "queued",
            "in_progress",
            "completed",
            "failed",
            "nsfw",
            "canceled",
          ].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label="Model"
          value={modelId}
          onChange={(event) =>
            navigate({ model: event.target.value, cursor: "" })
          }
          className={input}
        >
          <option value="">All models</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
      </div>
      <Table>
        <thead>
          <tr>
            <Th />
            <Th>User</Th>
            <Th>Model / path</Th>
            <Th>Status</Th>
            <Th right>Cost</Th>
            <Th right>Refunded</Th>
            <Th right>USD basis</Th>
            <Th>Created</Th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((row) => (
            <tr key={row.id} className="border-t border-white/5 align-top">
              <td className="px-3 py-2.5">
                {row.thumb ? (
                  row.kind === "video" ? (
                    <video
                      src={row.thumb}
                      muted
                      preload="metadata"
                      className="size-12 rounded-lg object-cover"
                    />
                  ) : (
                    <img
                      src={row.thumb}
                      alt=""
                      className="size-12 rounded-lg object-cover"
                    />
                  )
                ) : (
                  <span className="block size-12 rounded-lg bg-surface" />
                )}
              </td>
              <td className="px-3 py-2.5">{row.userEmail}</td>
              <td className="px-3 py-2.5">
                <div>{row.modelId}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {row.modelPath}
                </div>
                {row.error ? (
                  <div className="mt-1 text-xs text-[#ff6b6b]">{row.error}</div>
                ) : null}
                {row.hfRequestId ? (
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {row.hfRequestId}
                  </div>
                ) : null}
              </td>
              <td className={cn("px-3 py-2.5", STATUS_TONE[row.status])}>
                {row.status}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {row.cost}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                {row.refunded}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                ${row.priceUsd.toFixed(3)}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                {new Date(row.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
          {page.items.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                className="px-3 py-6 text-center text-muted-foreground"
              >
                No generations.
              </td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      {page.nextCursor ? (
        <Button
          variant="outline"
          className="self-center"
          onClick={() => navigate({ cursor: page.nextCursor! })}
        >
          Older
        </Button>
      ) : null}
    </section>
  )
}

/* ── Models & pricing ──────────────────────────────────────────────────── */

const SOURCE_LABEL: Record<PriceRule["source"], string> = {
  placeholder: "unverified",
  estimate: "estimate",
  description: "from pricing text",
  admin: "admin",
}

export function AdminModels({
  rows,
  placeholderCount,
}: {
  rows: AdminModelRow[]
  placeholderCount: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [edit, setEdit] = useState<{
    modelId: string
    path: string
    usd: string
    per: "second" | "output" | "request"
  } | null>(null)
  return (
    <section className="flex flex-col gap-4">
      {placeholderCount ? (
        <p className="flex items-start gap-2 rounded-2xl border border-pink/30 bg-pink/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-pink" />
          {placeholderCount} endpoints have unverified prices, so they
          can&apos;t be run on the live platform. Run{" "}
          <code className="font-mono">pnpm pricing:sync</code> with your
          platform key, or set a price below for any the estimate endpoint
          can&apos;t price (check the cost in your Higgsfield console).
        </p>
      ) : null}
      <Table>
        <thead>
          <tr>
            <Th>Model</Th>
            <Th>Enabled</Th>
            <Th>Endpoints · USD per unit · source</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-white/5 align-top">
              <td className="px-3 py-2.5">
                <div className="font-medium">{row.label}</div>
                <div className="text-xs text-muted-foreground">
                  {row.family} · {row.surface}
                </div>
                {row.repriceNeeded ? (
                  <div className="mt-1 text-xs text-pink">
                    Reprice: live ${row.repriceNeeded.liveUsd.toFixed(3)} vs
                    ours ${row.repriceNeeded.ourUsd.toFixed(3)}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.enabled}
                  aria-label={`${row.enabled ? "Disable" : "Enable"} ${row.label}`}
                  onClick={async () => {
                    const result = await setModelEnabledAction(
                      row.id,
                      !row.enabled
                    )
                    if (!result.ok)
                      return toast.error("Couldn't update", result.error)
                    router.refresh()
                  }}
                  className={cn(
                    "relative h-5 w-9 rounded-full",
                    row.enabled ? "bg-lime" : "bg-[#3a3d42]"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform",
                      row.enabled && "translate-x-4"
                    )}
                  />
                </button>
              </td>
              <td className="px-3 py-2.5">
                <ul className="flex flex-col gap-1">
                  {row.paths.map(({ path, rule }) => (
                    <li
                      key={path}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="font-mono text-xs">{path}</span>
                      {rule ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          ${rule.usd} / {rule.per}
                        </span>
                      ) : (
                        <span className="text-xs text-pink">unpriced</span>
                      )}
                      {rule ? (
                        <span
                          className={cn(
                            "rounded px-1.5 text-[11px]",
                            rule.source === "placeholder"
                              ? "bg-pink/15 text-pink"
                              : "bg-lime/15 text-lime"
                          )}
                        >
                          {SOURCE_LABEL[rule.source]}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Override price for ${path}`}
                        onClick={() =>
                          setEdit({
                            modelId: row.id,
                            path,
                            usd: String(rule?.usd ?? ""),
                            per: rule?.per ?? "request",
                          })
                        }
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Dialog
        open={edit !== null}
        onOpenChange={(open) => !open && setEdit(null)}
      >
        <DialogContent size="sm">
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              if (!edit) return
              const result = await setPriceOverrideAction({
                modelId: edit.modelId,
                path: edit.path,
                usd: edit.usd.trim() === "" ? null : Number(edit.usd),
                per: edit.per,
              })
              if (!result.ok) return toast.error("Couldn't save", result.error)
              setEdit(null)
              toast.success("Price saved")
              router.refresh()
            }}
          >
            <DialogHeader>
              <DialogTitle>Price override</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {edit?.path}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  Platform cost in USD per unit (empty removes the override)
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={edit?.usd ?? ""}
                    onChange={(event) =>
                      setEdit((current) =>
                        current
                          ? { ...current, usd: event.target.value }
                          : current
                      )
                    }
                    className={input}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Unit
                  <select
                    value={edit?.per ?? "request"}
                    onChange={(event) =>
                      setEdit((current) =>
                        current
                          ? {
                              ...current,
                              per: event.target.value as
                                "second" | "output" | "request",
                            }
                          : current
                      )
                    }
                    className={input}
                  >
                    <option value="second">per second of video</option>
                    <option value="output">per image</option>
                    <option value="request">per request</option>
                  </select>
                </label>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEdit(null)}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}

/* ── Presets (Effects) ─────────────────────────────────────────────────── */

type PresetForm = {
  id?: string
  slug: string
  title: string
  description: string
  surface: "image" | "video" | "audio"
  modelId: string
  promptTemplate: string
  settings: string
  coverUrl: string
  coverVideoUrl: string
  category: string
  order: string
  active: boolean
}

function toForm(preset?: PresetView): PresetForm {
  return {
    ...(preset ? { id: preset.id } : {}),
    slug: preset?.slug ?? "",
    title: preset?.title ?? "",
    description: preset?.description ?? "",
    surface: preset?.surface ?? "video",
    modelId: preset?.modelId ?? "seedance-2.5",
    promptTemplate: preset?.promptTemplate ?? "{subject}, ",
    settings: JSON.stringify(preset?.settings ?? {}),
    coverUrl: preset?.coverUrl ?? "",
    coverVideoUrl: preset?.coverVideoUrl ?? "",
    category: preset?.category ?? "Cinematic",
    order: "100",
    active: preset?.active ?? true,
  }
}

export function AdminPresets({
  presets,
  models,
}: {
  presets: PresetView[]
  models: { id: string; label: string; surface: string }[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = useState<PresetForm | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<PresetView | null>(null)
  const set = <K extends keyof PresetForm>(key: K, value: PresetForm[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current))
  return (
    <section className="flex flex-col gap-4">
      <Button className="self-start" onClick={() => setForm(toForm())}>
        <Plus /> New effect
      </Button>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {presets.map((preset) => (
          <div
            key={preset.id}
            className="overflow-hidden rounded-2xl bg-surface"
          >
            <img
              src={preset.coverUrl}
              alt=""
              className="aspect-[3/4] w-full object-cover"
            />
            <div className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{preset.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {preset.modelLabel} · {preset.category}{" "}
                  {preset.active ? "" : "· hidden"}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Edit ${preset.title}`}
                onClick={() => setForm(toForm(preset))}
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${preset.title}`}
                onClick={() => setRemoving(preset)}
                className="text-[#ff6b6b]"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <Dialog
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
      >
        <DialogContent size="md">
          {form ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault()
                setError(null)
                let settings: Record<string, unknown>
                try {
                  settings = JSON.parse(form.settings || "{}") as Record<
                    string,
                    unknown
                  >
                } catch {
                  return setError("Settings must be valid JSON.")
                }
                const result = await upsertPresetAction(
                  {
                    slug: form.slug,
                    title: form.title,
                    description: form.description,
                    surface: form.surface,
                    modelId: form.modelId,
                    promptTemplate: form.promptTemplate,
                    settings,
                    coverUrl: form.coverUrl,
                    ...(form.coverVideoUrl
                      ? { coverVideoUrl: form.coverVideoUrl }
                      : {}),
                    category: form.category,
                    order: Number(form.order),
                    active: form.active,
                  },
                  form.id
                )
                if (!result.ok) return setError(result.error)
                setForm(null)
                toast.success("Effect saved")
                router.refresh()
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {form.id ? "Edit effect" : "New effect"}
                </DialogTitle>
                <DialogDescription>
                  Use {"{subject}"} in the template where the user&apos;s prompt
                  goes.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["title", "Title"],
                      ["slug", "Slug"],
                      ["category", "Category"],
                      ["order", "Order"],
                      ["coverUrl", "Cover image URL"],
                      ["coverVideoUrl", "Cover video URL (optional)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex flex-col gap-1 text-sm">
                      {label}
                      <input
                        value={form[key]}
                        onChange={(event) => set(key, event.target.value)}
                        className={input}
                      />
                    </label>
                  ))}
                  <label className="flex flex-col gap-1 text-sm">
                    Model
                    <select
                      value={form.modelId}
                      onChange={(event) => {
                        const model = models.find(
                          (m) => m.id === event.target.value
                        )
                        set("modelId", event.target.value)
                        if (model)
                          set("surface", model.surface as PresetForm["surface"])
                      }}
                      className={input}
                    >
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label} ({model.surface})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) => set("active", event.target.checked)}
                      className="accent-[#0582ca]"
                    />
                    Visible in the gallery
                  </label>
                  <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                    Description
                    <input
                      value={form.description}
                      onChange={(event) =>
                        set("description", event.target.value)
                      }
                      className={input}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                    Prompt template
                    <textarea
                      value={form.promptTemplate}
                      onChange={(event) =>
                        set("promptTemplate", event.target.value)
                      }
                      rows={3}
                      className={cn(input, "h-auto py-2")}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                    Settings (JSON, catalog keys)
                    <input
                      value={form.settings}
                      onChange={(event) => set("settings", event.target.value)}
                      className={cn(input, "font-mono")}
                    />
                  </label>
                  {error ? (
                    <p
                      role="alert"
                      className="text-sm text-[#ff6b6b] sm:col-span-2"
                    >
                      {error}
                    </p>
                  ) : null}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setForm(null)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        title={`Delete “${removing?.title}”?`}
        description="It disappears from the Effects gallery. Generations made with it are unaffected."
        confirmLabel="Delete"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          const result = await deletePresetAction(removing.id)
          setRemoving(null)
          if (!result.ok) return toast.error("Couldn't delete", result.error)
          router.refresh()
        }}
      />
    </section>
  )
}

/* ── Templates (premade, uploaded by the admin) ───────────────────────── */

type TemplateForm = {
  id?: string
  title: string
  description: string
  surface: "image" | "video" | "audio"
  modelId: string
  prompt: string
  settings: string
  coverUrl: string
  coverVideoUrl: string
  category: string
  order: string
  active: boolean
}

function toTemplateForm(template?: TemplateView): TemplateForm {
  return {
    ...(template ? { id: template.id } : {}),
    title: template?.title ?? "",
    description: template?.description ?? "",
    surface: template?.surface ?? "image",
    modelId: template?.modelId ?? "soul-2",
    prompt: template?.prompt ?? "",
    settings: JSON.stringify(template?.settings ?? {}),
    coverUrl: template?.coverUrl ?? "",
    coverVideoUrl: template?.coverVideoUrl ?? "",
    category: template?.category ?? "General",
    order: "100",
    active: template?.active ?? true,
  }
}

export function AdminTemplates({
  templates,
  models,
}: {
  templates: TemplateView[]
  models: { id: string; label: string; surface: string }[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = useState<TemplateForm | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState<TemplateView | null>(null)
  const set = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current))
  return (
    <section className="flex flex-col gap-4">
      <Button className="self-start" onClick={() => setForm(toTemplateForm())}>
        <Plus /> New template
      </Button>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {templates.map((template) => (
          <div
            key={template.id}
            className="overflow-hidden rounded-2xl bg-surface"
          >
            {template.coverUrl ? (
              <img
                src={template.coverUrl}
                alt=""
                className="aspect-[4/5] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/5] w-full items-center justify-center bg-raised p-4 text-center text-xs text-muted-foreground">
                No cover
              </div>
            )}
            <div className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{template.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {template.modelLabel} · {template.category}{" "}
                  {template.active ? "" : "· hidden"}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Edit ${template.title}`}
                onClick={() => setForm(toTemplateForm(template))}
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${template.title}`}
                onClick={() => setRemoving(template)}
                className="text-[#ff6b6b]"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {templates.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-sm text-muted-foreground">
          No premade templates yet. Create one and it shows on the Templates
          page for everyone.
        </p>
      ) : null}
      <Dialog
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
      >
        <DialogContent size="md">
          {form ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault()
                setError(null)
                let settings: Record<string, unknown>
                try {
                  settings = JSON.parse(form.settings || "{}") as Record<
                    string,
                    unknown
                  >
                } catch {
                  return setError("Settings must be valid JSON.")
                }
                const result = await upsertTemplateAction(
                  {
                    title: form.title,
                    description: form.description,
                    surface: form.surface,
                    modelId: form.modelId,
                    prompt: form.prompt,
                    settings,
                    ...(form.coverUrl ? { coverUrl: form.coverUrl } : {}),
                    ...(form.coverVideoUrl
                      ? { coverVideoUrl: form.coverVideoUrl }
                      : {}),
                    category: form.category,
                    order: Number(form.order),
                    active: form.active,
                  },
                  form.id
                )
                if (!result.ok) return setError(result.error)
                setForm(null)
                toast.success("Template saved")
                router.refresh()
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {form.id ? "Edit template" : "New template"}
                </DialogTitle>
                <DialogDescription>
                  The full prompt, model and settings load into the generator
                  when someone clicks Use template.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["title", "Title"],
                      ["category", "Category"],
                      ["order", "Order"],
                      ["description", "Short note (optional)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex flex-col gap-1 text-sm">
                      {label}
                      <input
                        value={form[key]}
                        onChange={(event) => set(key, event.target.value)}
                        className={input}
                      />
                    </label>
                  ))}
                  <label className="flex flex-col gap-1 text-sm">
                    Model
                    <select
                      value={form.modelId}
                      onChange={(event) => {
                        const model = models.find(
                          (m) => m.id === event.target.value
                        )
                        set("modelId", event.target.value)
                        if (model)
                          set(
                            "surface",
                            model.surface as TemplateForm["surface"]
                          )
                      }}
                      className={input}
                    >
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label} ({model.surface})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) => set("active", event.target.checked)}
                      className="accent-[#0582ca]"
                    />
                    Visible on the Templates page
                  </label>
                  <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                    Cover image (upload or paste a URL)
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploading}
                      onChange={async (event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        setUploading(true)
                        setError(null)
                        try {
                          const upload = await uploadMedia(file)
                          set("coverUrl", upload.url)
                        } catch (caught) {
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : "Upload failed."
                          )
                        } finally {
                          setUploading(false)
                        }
                      }}
                      className="text-xs text-muted-foreground"
                    />
                    <input
                      value={form.coverUrl}
                      placeholder="https://… or /media/…"
                      onChange={(event) => set("coverUrl", event.target.value)}
                      className={input}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                    Prompt
                    <textarea
                      value={form.prompt}
                      onChange={(event) => set("prompt", event.target.value)}
                      rows={4}
                      className={cn(input, "h-auto py-2")}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                    Settings (JSON, catalog keys)
                    <input
                      value={form.settings}
                      onChange={(event) => set("settings", event.target.value)}
                      className={cn(input, "font-mono")}
                    />
                  </label>
                  {error ? (
                    <p
                      role="alert"
                      className="text-sm text-[#ff6b6b] sm:col-span-2"
                    >
                      {error}
                    </p>
                  ) : null}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setForm(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={uploading}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        title={`Delete “${removing?.title}”?`}
        description="It disappears from the Templates page for everyone."
        confirmLabel="Delete"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          const result = await deleteTemplateAdminAction(removing.id)
          setRemoving(null)
          if (!result.ok) return toast.error("Couldn't delete", result.error)
          router.refresh()
        }}
      />
    </section>
  )
}

/* ── Moderation ────────────────────────────────────────────────────────── */

export function AdminModeration({ items }: { items: ModerationItem[] }) {
  const router = useRouter()
  const toast = useToast()
  if (!items.length)
    return (
      <p className="rounded-2xl bg-surface p-6 text-sm text-muted-foreground">
        No open reports. 🎉
      </p>
    )
  return (
    <section className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.generationId}
          className="flex gap-3 rounded-2xl bg-surface p-3"
        >
          {item.thumb ? (
            item.kind === "video" ? (
              <video
                src={item.thumb}
                muted
                controls
                preload="metadata"
                className="size-28 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <img
                src={item.thumb}
                alt=""
                className="size-28 shrink-0 rounded-xl object-cover"
              />
            )
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="line-clamp-2 text-sm">{item.prompt}</p>
            <p className="text-xs text-muted-foreground">
              {item.modelLabel} · {item.isPublic ? "public" : "unpublished"} ·{" "}
              <Link href={`/g/${item.generationId}`} className="underline">
                open
              </Link>
            </p>
            <ul className="text-xs text-pink">
              {item.reports.map((report) => (
                <li key={report.id}>
                  {report.reason}
                  {report.details ? ` — ${report.details}` : ""}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const result = await moderateAction(
                    item.generationId,
                    "unpublish"
                  )
                  if (!result.ok) return toast.error("Failed", result.error)
                  toast.success("Unpublished")
                  router.refresh()
                }}
              >
                Unpublish
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const result = await moderateAction(
                    item.generationId,
                    "dismiss"
                  )
                  if (!result.ok) return toast.error("Failed", result.error)
                  router.refresh()
                }}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}
