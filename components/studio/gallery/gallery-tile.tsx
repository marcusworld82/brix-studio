/* eslint-disable @next/next/no-img-element */
"use client"

import { memo, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import {
  AudioLines,
  Loader2,
  Pause,
  Play,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react"

import { CardActions } from "@/components/studio/generation-card"
import { GenerationDetailModal } from "@/components/studio/generation-detail"
import { downloadMedia } from "@/lib/studio/download-media"

import type { TileRect } from "./justified-engine"
import type { GalleryItem, LoadTier, TileActions } from "./gallery-types"

/**
 * One gallery tile, absolutely positioned at the engine-computed rect.
 * Mounted media stays mounted while scrolling so finished generations never
 * flash back to placeholders. Generating and failed tiles stay visible.
 */
export interface GalleryTileProps {
  item: GalleryItem
  rect: TileRect
  top: number
  tier: LoadTier
  reducedMotion: boolean
  actions?: TileActions
}

function rectStyle(rect: TileRect, top: number): CSSProperties {
  return { left: rect.x, top, width: rect.width, height: rect.height }
}

function Placeholder() {
  return <span className="absolute inset-0 bg-surface" aria-hidden="true" />
}

export function useElapsed(since: number, active = true): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes
    ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`
    : `${seconds}s`
}

function GeneratingTile({ item }: { item: GalleryItem }) {
  const elapsed = useElapsed(item.createdAt)
  const label =
    item.phase === "starting"
      ? "Starting"
      : item.phase === "queued"
        ? "Queued"
        : "Generating"
  return (
    <span className="absolute inset-0 overflow-hidden rounded-[inherit]">
      <span className="absolute inset-0 shimmer" aria-hidden="true" />
      <span
        className="studio-glow absolute inset-x-0 top-0 h-[45%]"
        aria-hidden="true"
      />
      <span
        className="absolute top-2 left-2 inline-flex items-center gap-2 rounded-full bg-black/40 py-1.5 pr-3 pl-2.5 backdrop-blur-md"
        role="status"
      >
        <Loader2 className="size-3.5 animate-spin text-lime" aria-hidden />
        <span className="text-xs font-medium text-lime">{label}</span>
        <span className="font-mono text-xs text-white/60 tabular-nums">
          {elapsed}
        </span>
      </span>
      <span className="absolute inset-x-3 bottom-3 line-clamp-2 text-xs text-white/50">
        {item.modelLabel} · {item.prompt || "No prompt"}
      </span>
    </span>
  )
}

function FailedTile({ item }: { item: GalleryItem }) {
  const blocked = item.failureKind === "nsfw"
  const Icon = blocked ? ShieldAlert : TriangleAlert
  return (
    <span
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface p-4 text-center"
      role="status"
    >
      <span
        className={
          blocked
            ? "flex size-9 items-center justify-center rounded-full bg-[#ff005b]/10 text-[#ff5c8a]"
            : "flex size-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground"
        }
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="text-sm font-semibold text-foreground">
        {blocked
          ? "Blocked by content filter"
          : item.failureKind === "canceled"
            ? "Canceled"
            : "Generation failed"}
      </span>
      <span className="line-clamp-3 max-w-[260px] text-xs text-muted-foreground">
        {item.failureLabel}
      </span>
    </span>
  )
}

function StillMedia({ item, tier }: { item: GalleryItem; tier: LoadTier }) {
  return (
    <>
      <Placeholder />
      <img
        className="absolute inset-0 size-full object-cover"
        src={item.src}
        alt={item.alt}
        loading={tier === "full" ? "eager" : "lazy"}
        decoding="async"
      />
    </>
  )
}

/** Poster by default; plays muted on hover/focus; honours reduced motion. */
function HoverVideo({
  item,
  playing,
  reducedMotion,
}: {
  item: GalleryItem
  playing: boolean
  reducedMotion: boolean
}) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const active = playing && !reducedMotion

  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (active) void video.play()?.catch(() => undefined)
    else {
      video.pause()
      try {
        video.currentTime = 0
      } catch {}
    }
  }, [active])

  return (
    <>
      <Placeholder />
      <video
        ref={ref}
        className="absolute inset-0 size-full object-cover"
        muted
        loop
        playsInline
        preload="metadata"
      >
        <source src={item.videoSrc} />
      </video>
    </>
  )
}

function AudioMedia({ item }: { item: GalleryItem }) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const bars = Array.from({ length: 28 }, (_, i) => 20 + ((i * 37) % 70))
  return (
    <span className="absolute inset-0 flex flex-col justify-between bg-gradient-to-br from-[#1c1e21] to-[#23262a] p-4">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <AudioLines className="size-3.5 text-lime" aria-hidden />{" "}
        {item.modelLabel}
      </span>
      <span className="flex h-12 items-end gap-[3px]" aria-hidden>
        {bars.map((height, index) => (
          <span
            key={index}
            className={
              playing
                ? "w-1 rounded-full bg-lime"
                : "w-1 rounded-full bg-white/25"
            }
            style={{ height: `${height}%` }}
          />
        ))}
      </span>
      <span className="relative z-[3] flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? "Pause audio" : "Play audio"}
          className="flex size-9 items-center justify-center rounded-full bg-lime text-white"
          onClick={(event) => {
            event.stopPropagation()
            const audio = ref.current
            if (!audio) return
            if (playing) audio.pause()
            else void audio.play().catch(() => setPlaying(false))
          }}
        >
          {playing ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4 fill-current" />
          )}
        </button>
        <span className="line-clamp-2 text-xs text-white/70">
          {item.prompt}
        </span>
      </span>
      <audio
        ref={ref}
        src={item.audioSrc}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </span>
  )
}

function GalleryTileComponent({
  item,
  rect,
  top,
  tier,
  reducedMotion,
  actions,
}: GalleryTileProps) {
  const [hovered, setHovered] = useState(false)
  const style = rectStyle(rect, top)
  const src = item.videoSrc ?? item.audioSrc ?? item.src
  // A download action without a handler downloads this tile's media.
  const itemActions = (actions?.(item) ?? []).map((action) =>
    action.id === "download" && !action.onSelect && src
      ? { ...action, onSelect: () => void downloadMedia(src) }
      : action
  )

  if (item.status !== "ready") {
    return (
      <div className="studio-tile group" style={style}>
        {item.status === "generating" ? (
          <GeneratingTile item={item} />
        ) : (
          <FailedTile item={item} />
        )}
        {itemActions.length ? <CardActions actions={itemActions} /> : null}
      </div>
    )
  }

  const media =
    item.kind === "video" ? (
      <HoverVideo item={item} playing={hovered} reducedMotion={reducedMotion} />
    ) : item.kind === "audio" ? (
      <AudioMedia item={item} />
    ) : (
      <StillMedia item={item} tier={tier} />
    )
  return (
    <div
      className="studio-tile group"
      style={style}
      onMouseEnter={item.kind === "video" ? () => setHovered(true) : undefined}
      onMouseLeave={item.kind === "video" ? () => setHovered(false) : undefined}
    >
      {media}
      <GenerationDetailModal
        generation={{
          src,
          mediaType: item.kind,
          aspectRatio: item.width / item.height,
          prompt: item.prompt,
          model: item.modelLabel,
          createdAt: item.createdAt,
          settings: item.settings,
          ...(item.generation
            ? { cost: item.generation.cost - item.generation.refunded }
            : {}),
        }}
        actions={itemActions}
        trigger={
          <button
            type="button"
            aria-label={`Open generation: ${item.prompt || item.modelLabel}`}
            className="absolute inset-0 z-[1] cursor-pointer focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none focus-visible:ring-inset"
            onFocus={item.kind === "video" ? () => setHovered(true) : undefined}
            onBlur={item.kind === "video" ? () => setHovered(false) : undefined}
          />
        }
      />
      {itemActions.length ? <CardActions actions={itemActions} /> : null}
    </div>
  )
}

export const GalleryTile = memo(GalleryTileComponent)
