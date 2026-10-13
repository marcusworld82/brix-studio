"use client"

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react"
import { BookOpen, FolderClosed, Loader2 } from "lucide-react"

import { useApp } from "@/components/providers/app-providers"
import { UserGenerations } from "@/components/studio/user-generations"
import type { GeneratorTab, Surface } from "@/generation/catalog/types"
import { runToGalleryItems } from "@/lib/studio/gallery-items"
import { STEPS } from "@/lib/showcase"
import { cn } from "@/lib/utils"

import { useTileActions } from "./tile-actions"
import type { Generator } from "./use-generator"

const HEADLINE: Record<Surface, Record<GeneratorTab, [string, string]>> = {
  video: {
    create: [
      "Make videos in one click",
      "Start from text, a first frame or a stack of references — then direct the camera.",
    ],
    edit: [
      "Edit any video with words",
      "Upload a clip, describe the change, keep the framing.",
    ],
    motion: [
      "Copy any motion",
      "Give us a motion clip and a character image; we transfer every move.",
    ],
  },
  image: {
    create: [
      "Start creating with any model",
      "Describe a scene, character, mood or style — and watch it come to life.",
    ],
    edit: [
      "Edit images with words",
      "Attach references and describe the change.",
    ],
    motion: ["Start creating", "Describe what you want to see."],
  },
  audio: {
    create: [
      "Turn text into sound",
      "Voices, effects and music from a single prompt.",
    ],
    edit: ["Edit audio", "Describe the change you want."],
    motion: ["Design a voice", "Describe the voice you need."],
  },
}

export function HowItWorks({
  surface,
  tab,
}: {
  surface: Surface
  tab: GeneratorTab
}) {
  const [title, subtitle] = HEADLINE[surface][tab]
  const steps = STEPS[surface]
  const centered = tab !== "create"
  return (
    <div
      className={cn(
        "flex min-h-full flex-col justify-center gap-10 px-6 py-10 md:px-12",
        centered && "items-center text-center"
      )}
    >
      <div
        className={cn(
          "flex max-w-3xl flex-col gap-3",
          centered && "items-center"
        )}
      >
        <h1 className="font-display text-4xl md:text-5xl">{title}</h1>
        <p className="text-sm text-muted-foreground md:text-base">{subtitle}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step.title} className="flex flex-col gap-3 text-left">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface">
              <img
                src={step.image}
                alt=""
                className="size-full object-cover"
                loading="lazy"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>
            {centered ? (
              <span className="w-fit rounded-md bg-surface px-2 py-0.5 text-xs text-muted-foreground">
                Step {index + 1}
              </span>
            ) : null}
            <h2 className="font-display text-xl">{step.title}</h2>
            <p className="text-sm text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Canvas({
  generator,
  className,
  bottomInset = 0,
}: {
  generator: Generator
  className?: string
  bottomInset?: number
}) {
  const { user } = useApp()
  const { runs, surface, tab } = generator
  const [chosen, setView] = useState<"history" | "how" | null>(null)
  const [filter, setFilter] = useState<"all" | "completed" | "failed">("all")
  const hasHistory = runs.records.length > 0
  // History as soon as there's something in it, unless the user picked a view.
  const view = chosen ?? (hasHistory ? "history" : "how")

  const items = useMemo(() => {
    const filtered = runs.records.filter((run) =>
      filter === "all"
        ? true
        : filter === "completed"
          ? run.status === "completed"
          : run.status === "failed" ||
            run.status === "nsfw" ||
            run.status === "canceled"
    )
    return filtered.flatMap(runToGalleryItems)
  }, [filter, runs.records])

  const { actions, dialogs } = useTileActions({ runs, reuse: generator.reuse })

  const toggle = (
    <div
      className="flex items-center gap-1 rounded-[10px] p-0.5"
      role="tablist"
      aria-label="Canvas view"
    >
      {(
        [
          ["history", "History", FolderClosed],
          ["how", "How it works", BookOpen],
        ] as const
      ).map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={view === value}
          onClick={() => setView(value)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
            view === value
              ? "bg-white/[0.08] text-foreground"
              : "text-white/50 hover:text-foreground"
          )}
        >
          <Icon className="size-3.5" /> {label}
        </button>
      ))}
    </div>
  )

  return (
    <section
      aria-label="Results"
      className={cn(
        "studio-backdrop relative flex min-h-[60vh] min-w-0 shrink-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-white/10 md:min-h-0 md:shrink",
        className
      )}
    >
      {view === "how" ? (
        <>
          <div className="flex h-12 shrink-0 items-center px-3">{toggle}</div>
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            style={{ paddingBottom: bottomInset }}
          >
            <HowItWorks surface={surface} tab={tab} />
          </div>
        </>
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col px-3 pt-2"
          style={{ paddingBottom: bottomInset + 12 }}
        >
          <UserGenerations
            items={items}
            title={toggle}
            toolbar={
              <select
                aria-label="Filter history"
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as typeof filter)
                }
                className="h-8 rounded-lg border border-white/5 bg-white/[0.02] px-2 text-xs text-foreground outline-none"
              >
                <option value="all">All</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed & blocked</option>
              </select>
            }
            hasMore={runs.hasMore}
            loadingMore={runs.loadingMore}
            onLoadMore={runs.loadMore}
            actions={actions}
            emptyState={
              !user ? (
                <HowItWorks surface={surface} tab={tab} />
              ) : !runs.loaded ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" /> Loading your
                  history…
                </div>
              ) : (
                <HowItWorks surface={surface} tab={tab} />
              )
            }
          />
        </div>
      )}
      {dialogs}
    </section>
  )
}
