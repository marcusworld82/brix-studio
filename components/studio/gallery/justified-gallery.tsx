"use client"

import type { ReactNode } from "react"
import { Check, Loader2 } from "lucide-react"

import {
  ScreenEmptyState,
  type ScreenEmptyStateContent,
} from "@/components/studio/screen-empty-state"
import { cn } from "@/lib/utils"

import { DensityControl } from "./density-control"
import { GalleryTile } from "./gallery-tile"
import type { GalleryItem, LoadTier, TileActions } from "./gallery-types"
import { useJustifiedGallery } from "./use-justified-gallery"
import { useReducedMotion } from "./use-reduced-motion"

/**
 * JustifiedGallery — the virtualized justified-masonry feed. The engine owns
 * layout + windowing math; this renders only the visible rows as absolutely
 * positioned tiles over a fixed-height sizer.
 */
export interface GallerySelection {
  selected: ReadonlySet<string>
  onToggle: (item: GalleryItem) => void
}

export interface JustifiedGalleryProps {
  items: GalleryItem[]
  title?: ReactNode
  /** Extra toolbar content left of the density control. */
  toolbar?: ReactNode
  grouped?: boolean
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void | Promise<unknown>
  emptyState: ScreenEmptyStateContent | ReactNode
  actions?: TileActions
  /** Selection mode: tiles toggle instead of opening the lightbox. */
  selection?: GallerySelection
  showHeader?: boolean
}

function isContent(value: unknown): value is ScreenEmptyStateContent {
  return Boolean(
    value && typeof value === "object" && "images" in value && "title" in value
  )
}

export function JustifiedGallery({
  items,
  title,
  toolbar,
  grouped = false,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyState,
  actions,
  selection,
  showHeader = true,
}: JustifiedGalleryProps) {
  const reducedMotion = useReducedMotion()
  const { viewportRef, ...gallery } = useJustifiedGallery(items, grouped, {
    hasMore,
    loadingMore,
    onLoadMore,
  })
  const viewBottom = gallery.scrollTop + gallery.viewportHeight

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showHeader ? (
        <header className="flex shrink-0 items-center justify-between gap-4 px-0.5">
          <div className="flex min-w-0 items-center gap-2">
            {title != null ? (
              <h1 className="text-q-headline-sm-semi-bold whitespace-nowrap">
                {title}
              </h1>
            ) : null}
            {gallery.loadingMore ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Loading
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {toolbar}
            <DensityControl
              value={gallery.density}
              onChange={gallery.setDensity}
            />
          </div>
        </header>
      ) : null}

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-y-auto [overscroll-behavior:contain]"
      >
        {gallery.itemCount === 0 ? (
          isContent(emptyState) ? (
            <ScreenEmptyState className="h-full" {...emptyState} />
          ) : (
            emptyState
          )
        ) : (
          <div
            className="relative w-full"
            style={{ height: gallery.layout.totalHeight }}
          >
            {gallery.visibleRows.map((row) => {
              if (row.type === "header") {
                return (
                  <div
                    key={row.key}
                    className="absolute inset-x-0 flex items-end px-0.5 pb-2"
                    style={{ top: row.y, height: row.height }}
                  >
                    <h3 className="text-xs font-medium text-muted-foreground">
                      {row.label}
                    </h3>
                  </div>
                )
              }
              const visible =
                row.y < viewBottom && row.y + row.height > gallery.scrollTop
              const tier: LoadTier = visible ? "full" : "near"
              return row.tiles!.map((rect) => {
                if (!selection)
                  return (
                    <GalleryTile
                      key={rect.item.id}
                      item={rect.item}
                      rect={rect}
                      top={row.y}
                      tier={tier}
                      reducedMotion={reducedMotion}
                      actions={actions}
                    />
                  )
                const selected = selection.selected.has(rect.item.runId)
                return (
                  <div key={rect.item.id}>
                    <GalleryTile
                      item={rect.item}
                      rect={rect}
                      top={row.y}
                      tier={tier}
                      reducedMotion={reducedMotion}
                    />
                    <button
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${selected ? "Deselect" : "Select"} ${rect.item.prompt || rect.item.modelLabel}`}
                      onClick={() => selection.onToggle(rect.item)}
                      className={cn(
                        "absolute z-[3] rounded-[var(--radius)] transition-colors",
                        selected
                          ? "ring-2 ring-lime ring-inset"
                          : "hover:bg-white/5"
                      )}
                      style={{
                        left: rect.x,
                        top: row.y,
                        width: rect.width,
                        height: rect.height,
                      }}
                    >
                      <span
                        className={cn(
                          "absolute top-2 left-2 flex size-6 items-center justify-center rounded-full border",
                          selected
                            ? "border-lime bg-lime text-white"
                            : "border-white/40 bg-black/40 text-transparent"
                        )}
                      >
                        <Check className="size-3.5" />
                      </span>
                    </button>
                  </div>
                )
              })
            })}
          </div>
        )}
      </div>
    </div>
  )
}
