/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react"
import { Sparkle } from "lucide-react"

import type { ModelEntry } from "@/generation/catalog/types"
import { cn } from "@/lib/utils"

const TONES = {
  pink: "bg-pink-strong text-white",
  lime: "bg-lime text-white",
  blue: "bg-gradient-to-r from-[#4fc9dc] via-[#32a2ee] to-[#167bff] text-white",
  muted: "bg-white/10 text-white",
} as const

/** Space Grotesk italic micro-badge: TOP, NEW, BEST VALUE, % OFF. */
export function ItalicBadge({
  tone,
  children,
  className,
}: {
  tone: keyof typeof TONES
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "font-display inline-flex h-4 shrink-0 items-center rounded-[4px] px-1.5 text-[10px] italic",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

/** The first TOP / NEW badge a model carries (TOP wins). */
export function ModelBadge({ model }: { model: ModelEntry }) {
  if (model.badges?.includes("TOP"))
    return <ItalicBadge tone="pink">Top</ItalicBadge>
  if (model.badges?.includes("NEW"))
    return <ItalicBadge tone="lime">New</ItalicBadge>
  return null
}

/** Model brand glyph from /public/model-icons, knocked out to white. */
export function ModelGlyph({
  model,
  className,
}: {
  model: ModelEntry
  className?: string
}) {
  return model.icon ? (
    <img
      src={`/model-icons/${model.icon}.svg`}
      alt=""
      aria-hidden
      width={20}
      height={20}
      className={cn("size-5 brightness-0 invert", className)}
    />
  ) : (
    <Sparkle className={cn("size-5", className)} aria-hidden />
  )
}
