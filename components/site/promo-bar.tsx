"use client"

import Link from "next/link"
import { Tag, X } from "lucide-react"

import { BRAND } from "@/lib/brand"
import { useLocalFlag } from "@/lib/studio/local-flag"

const KEY = `vireo.promo.dismissed:${BRAND.promo}`

/** Optional dismissible promo bar; copy comes from NEXT_PUBLIC_PROMO_BAR. */
export function PromoBar() {
  const [dismissed, setDismissed, hydrated] = useLocalFlag(KEY)
  if (!BRAND.promo || !hydrated || dismissed === "1") return null
  return (
    <div className="relative flex min-h-11 items-center justify-center gap-3 bg-lime px-10 py-2 text-center text-sm font-medium text-white shadow-[0_0_12px_rgba(5,130,202,0.5)]">
      <Tag className="hidden size-4 sm:block" aria-hidden />
      <span>{BRAND.promo}</span>
      <Link
        href={BRAND.promoHref}
        className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-[#131517] hover:bg-white/90"
      >
        See offer
      </Link>
      <button
        type="button"
        aria-label="Dismiss promotion"
        className="absolute right-2 flex size-7 items-center justify-center rounded-lg hover:bg-black/10"
        onClick={() => setDismissed("1")}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
