"use client"

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Sparkles, Trash2 } from "lucide-react"

import { deleteTemplateAction } from "@/app/actions/templates"
import { ConfirmDialog } from "@/components/generator/tile-actions"
import { EmptyCard } from "@/components/marketing/empty-card"
import { useRecreate } from "@/components/marketing/recreate-button"
import { useApp, useToast } from "@/components/providers/app-providers"
import { cn } from "@/lib/utils"
import type { TemplateView } from "@/lib/templates"

type Tab = "official" | "mine"

function TemplateCard({
  template,
  onUse,
  onDelete,
}: {
  template: TemplateView
  onUse: () => void
  onDelete?: () => void
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface">
      <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-brix-main/40 via-raised to-page">
        {template.coverUrl ? (
          <img
            src={template.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <p className="absolute inset-0 line-clamp-[9] px-4 pt-12 pb-4 text-sm leading-relaxed text-white/60">
            {template.prompt}
          </p>
        )}
        <span className="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white/85 backdrop-blur">
          {template.surface === "video" ? "Video" : "Image"}
        </span>
        {onDelete ? (
          <button
            type="button"
            aria-label={`Delete ${template.title}`}
            onClick={onDelete}
            className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/55 text-white/85 backdrop-blur hover:text-[#ff6b6b]"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{template.title}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {template.modelLabel}
            {template.description ? ` · ${template.description}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onUse}
          className="btn-keycap mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold"
        >
          <Sparkles className="size-4" aria-hidden /> Use template
        </button>
      </div>
    </article>
  )
}

/** /templates: BRIX premade templates and the signed-in user's own. */
export function TemplatesView({
  official,
  mine,
}: {
  official: TemplateView[]
  mine: TemplateView[]
}) {
  const router = useRouter()
  const toast = useToast()
  const { user, openAuth } = useApp()
  const recreate = useRecreate()
  const [tab, setTab] = useState<Tab>("official")
  const [category, setCategory] = useState("All")
  const [removing, setRemoving] = useState<TemplateView | null>(null)

  const categories = [
    "All",
    ...new Set(official.map((template) => template.category)),
  ]
  const shown =
    tab === "mine"
      ? mine
      : category === "All"
        ? official
        : official.filter((template) => template.category === category)

  const use = (template: TemplateView) =>
    void recreate({
      surface: template.surface,
      modelId: template.modelId,
      prompt: template.prompt,
      settings: template.settings,
    })

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-4">
        <div
          role="tablist"
          aria-label="Template sets"
          className="inline-flex rounded-xl bg-white/5 p-1"
        >
          {(
            [
              ["official", `BRIX templates (${official.length})`],
              ["mine", `My templates${user ? ` (${mine.length})` : ""}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "h-9 rounded-lg px-4 text-sm font-medium transition-colors",
                tab === id
                  ? "bg-brix-main text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "official" && categories.length > 2 ? (
          <div
            role="group"
            aria-label="Filter templates by category"
            className="flex flex-wrap justify-center gap-2"
          >
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={item === category}
                onClick={() => setCategory(item)}
                className={cn(
                  "h-8 rounded-[10px] border px-3 text-sm font-medium uppercase transition-colors",
                  item === category
                    ? "border-lime/40 bg-lime/10 text-lime"
                    : "border-white/10 text-white hover:bg-white/10"
                )}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {shown.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onUse={() => use(template)}
              {...(tab === "mine" ? { onDelete: () => setRemoving(template) } : {})}
            />
          ))}
        </div>
      ) : tab === "mine" && !user ? (
        <EmptyCard
          icon={<Sparkles className="size-5" aria-hidden />}
          title="Sign in to keep your own templates"
          body="Save any prompt and model combo as a template, then reuse it in one click."
          action={
            <button
              type="button"
              onClick={() => openAuth()}
              className="btn-keycap inline-flex h-10 items-center rounded-[10px] px-4 text-sm font-semibold"
            >
              Sign in
            </button>
          }
        />
      ) : tab === "mine" ? (
        <EmptyCard
          icon={<Sparkles className="size-5" aria-hidden />}
          title="No templates yet"
          body="Hover a finished generation in your library and choose Save as template, or use the Save template button in the generator."
        />
      ) : (
        <EmptyCard
          icon={<Sparkles className="size-5" aria-hidden />}
          title="Templates are on their way"
          body="Premade BRIX templates will show up here."
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Delete “${removing?.title}”?`}
        description="This only removes the template. Your past generations are unaffected."
        confirmLabel="Delete"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          const result = await deleteTemplateAction(removing.id)
          setRemoving(null)
          if (!result.ok) return toast.error("Couldn't delete", result.error)
          toast.success("Template deleted")
          router.refresh()
        }}
      />
    </div>
  )
}
