import type { Metadata } from "next"
import Link from "next/link"
import { Sparkles } from "lucide-react"

import { Atmosphere } from "@/components/marketing/atmosphere"
import { loadEffects } from "@/components/marketing/data"
import { EffectsGallery } from "@/components/marketing/effects-gallery"
import { ProviderPresetGallery } from "@/components/provider-presets/gallery"
import { PRESET_CATEGORIES } from "@/lib/presets/seed-data"

export const metadata: Metadata = {
  title: "Visual effects",
  description:
    "Ready-made looks and camera moves for image and video. Pick an effect, describe your subject and generate.",
  openGraph: { images: ["/media/presets/neon-noir.jpg"] },
}

export default async function EffectsPage() {
  const effects = await loadEffects()
  return (
    <div className="flex flex-col">
      <section
        aria-labelledby="effects-title"
        className="relative isolate overflow-hidden bg-gradient-to-b from-black from-60% to-page"
      >
        <Atmosphere glow="top" className="-z-10" />
        <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-5 px-4 pt-12 pb-10 md:items-center md:pt-20 md:pb-14 md:text-center">
          <Link
            href="/video"
            className="font-display inline-flex h-8 items-center gap-1.5 rounded-full bg-lime/15 px-3 text-[13px] text-lime shadow-[0_0_24px_rgba(5,130,202,0.25)] transition-colors hover:bg-lime/25"
          >
            <Sparkles className="size-3.5" aria-hidden /> Open video studio
          </Link>
          <h1
            id="effects-title"
            className="font-display text-[44px] leading-[0.95] tracking-[-0.04em] text-lime md:text-[96px] md:leading-[100px]"
          >
            Visual effects
          </h1>
          <p className="max-w-[560px] text-sm text-muted-foreground md:text-base">
            Browse your provider&apos;s video restyles and image styles, then
            open a compatible model with the look selected.
          </p>
        </div>
      </section>
      <section
        aria-label="Effects gallery"
        className="mx-auto w-full max-w-[1440px] px-4"
      >
        <ProviderPresetGallery initialCatalog="genjutsu" />
        {effects.length > 0 && (
          <details className="mt-12 border-t border-white/10 pt-6">
            <summary className="cursor-pointer text-sm font-medium text-white/60">
              BRIX effects library
            </summary>
            <div className="mt-6">
              <EffectsGallery
                effects={effects}
                categories={PRESET_CATEGORIES}
              />
            </div>
          </details>
        )}
      </section>
    </div>
  )
}
