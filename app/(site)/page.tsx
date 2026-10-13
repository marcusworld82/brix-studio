/* eslint-disable @next/next/no-img-element */
import Link from "next/link"
import {
  ArrowUpRight,
  Check,
  ImageIcon,
  Sparkles,
  Users,
  Video,
} from "lucide-react"

import { Atmosphere } from "@/components/marketing/atmosphere"
import { ModelBadge, ModelGlyph } from "@/components/marketing/badges"
import { loadEffects } from "@/components/marketing/data"
import { EmptyCard } from "@/components/marketing/empty-card"
import { Masonry, MasonryItem } from "@/components/marketing/masonry"
import { EffectTile, TileMedia } from "@/components/marketing/media-tile"
import { ScrollRow } from "@/components/marketing/scroll-row"
import {
  FadeClamp,
  SectionHeader,
} from "@/components/marketing/section-header"
import { LoopVideo } from "@/components/media/loop-video"
import { findModel, MODELS } from "@/generation/catalog"
import type { ModelEntry } from "@/generation/catalog/types"
import { FAMILY_LOOPS, familyCover, HERO } from "@/lib/showcase"
import { listOfficialTemplates } from "@/lib/templates"

/** Top-of-page tool cards (§3.2): the models we lead with. */
const TOOL_IDS = [
  "seedance-2.5",
  "kling-3-std",
  "soul-2",
  "cinema-studio-4",
  "genjutsu-motion",
  "marketing-image-flare",
] as const

function generatorHref(model: ModelEntry): string {
  return `/${model.surface}?model=${encodeURIComponent(model.id)}`
}

/** One card per model family and surface, video first, each pointing at its lead model. */
function families(): { lead: ModelEntry; count: number }[] {
  const sorted = [...MODELS]
    .filter((model) => model.surface !== "audio")
    .sort(
      (a, b) =>
        (a.surface === "video" ? 0 : 1) - (b.surface === "video" ? 0 : 1) ||
        (a.order ?? 999) - (b.order ?? 999)
    )
  const byKey = new Map<string, { lead: ModelEntry; count: number }>()
  for (const model of sorted) {
    const key = `${model.surface}:${model.family}`
    const entry = byKey.get(key)
    if (entry) entry.count += 1
    else byKey.set(key, { lead: model, count: 1 })
  }
  return [...byKey.values()]
}

function SurfaceChip({ surface }: { surface: ModelEntry["surface"] }) {
  const Icon = surface === "video" ? Video : ImageIcon
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-white/5 px-2 text-xs text-white/80">
      <Icon className="size-3.5" aria-hidden />
      {surface === "video" ? "Video" : "Image"}
    </span>
  )
}

export default async function ExplorePage() {
  const [effects, templates] = await Promise.all([
    loadEffects(),
    listOfficialTemplates()
      .then((items) => items.slice(0, 12))
      .catch(() => []),
  ])
  const tools = TOOL_IDS.map((id) => findModel(id)).filter(
    (model): model is ModelEntry => Boolean(model)
  )
  const modelFamilies = families()

  return (
    <div className="flex flex-col gap-16 md:gap-24">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="hero-title"
        className="relative isolate -mt-px overflow-hidden"
      >
        <div className="absolute inset-0 -z-20">
          <LoopVideo
            src={HERO.video}
            poster="/media/loops/hero.jpg"
            className="absolute inset-0 size-full object-[50%_70%]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-page/75 via-transparent via-45% to-page" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_55%,rgba(15,17,19,0.9)_100%)]" />
        </div>
        <Atmosphere glow="top" className="-z-10" />
        <div className="mx-auto flex min-h-[600px] max-w-[1440px] flex-col items-center justify-start gap-6 px-4 pt-20 pb-44 text-center md:min-h-[min(90svh,820px)] md:pt-28">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 text-xs font-medium text-white/85 backdrop-blur-md">
            <Sparkles className="size-3.5 text-lime" aria-hidden />
            Every frontier model, one studio
          </span>
          <h1
            id="hero-title"
            className="font-display text-[44px] leading-[0.92] text-white sm:text-[60px] md:text-[80px] lg:text-[96px]"
          >
            Direct the shot.
            <br />
            <span className="text-lime">Skip the set.</span>
          </h1>
          <p className="max-w-[560px] text-base text-white/80 [text-shadow:0_1px_14px_rgba(0,0,0,0.7)] md:text-lg">
            Turn a sentence or a single frame into cinematic video and images.
            Seedance, Kling, Soul and dozens more models share one credit
            balance and one library.
          </p>
          <div className="flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/video"
              className="btn-keycap inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold sm:w-auto"
            >
              <Sparkles className="size-4" aria-hidden /> Start creating
            </Link>
            <Link
              href="/effects"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 text-base font-medium text-white backdrop-blur-md transition-colors hover:bg-white/10 sm:w-auto"
            >
              Explore effects
            </Link>
          </div>
        </div>
      </section>

      {/* ── Promo + tool cards ───────────────────────────────────────────── */}
      <section
        aria-labelledby="tools-title"
        className="relative z-10 mx-auto -mt-32 w-full max-w-[1440px] px-4 md:-mt-36"
      >
        <h2 id="tools-title" className="sr-only">
          Start with a top model
        </h2>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
          <div className="relative isolate flex min-h-[272px] flex-col justify-center gap-4 overflow-hidden rounded-[20px] border border-hairline p-6 md:p-8">
            <img
              src={HERO.mark}
              alt=""
              width={1200}
              height={675}
              className="absolute inset-0 -z-20 size-full -scale-x-100 object-cover object-[35%_center]"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/90 via-black/65 to-black/0" />
            <p className="font-display text-[30px] leading-[1.05] text-white md:text-[36px]">
              One balance.
              <br />
              <span className="text-lime">Every model.</span>
            </p>
            <ul className="flex flex-col gap-1.5 text-[13px] text-white/75">
              {[
                "Switch models without switching apps",
                "Failed runs are refunded automatically",
                "Top-up credits never expire",
              ].map((line) => (
                <li key={line} className="flex items-center gap-2">
                  <Check className="size-3.5 text-lime" aria-hidden /> {line}
                </li>
              ))}
            </ul>
            <Link
              href="/pricing"
              className="btn-keycap-white inline-flex h-11 w-fit items-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors hover:bg-white/90"
            >
              See plans &amp; credits
            </Link>
          </div>
          <ul role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tools.map((model) => (
              <li key={model.id}>
                <Link
                  href={generatorHref(model)}
                  className="group flex h-full min-h-[124px] flex-col justify-between gap-4 rounded-2xl border border-hairline bg-surface p-4 transition-colors duration-200 hover:bg-raised"
                >
                  <span className="flex items-start justify-between gap-2">
                    <ModelGlyph model={model} />
                    <SurfaceChip surface={model.surface} />
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-[15px] leading-5 font-semibold text-white">
                      {model.label}
                      <ModelBadge model={model} />
                    </span>
                    <span className="line-clamp-2 text-[13px] leading-[18px] text-muted-foreground sm:line-clamp-1">
                      {model.bestFor ?? model.description}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Visual effects ───────────────────────────────────────────────── */}
      {effects.length > 0 ? (
        <section
          aria-labelledby="effects-title"
          className="mx-auto w-full max-w-[1440px] px-4"
        >
          <SectionHeader
            id="effects-title"
            title="Visual effects"
            description="Signature looks and camera moves. Pick one, add your subject, generate."
            action={
              <Link
                href="/effects"
                className="btn-keycap inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold md:h-12 md:px-5 md:text-base"
              >
                <Sparkles className="size-4" aria-hidden /> Try an effect
              </Link>
            }
          />
          <FadeClamp
            href="/effects"
            label="View all effects"
            className="max-h-[720px] md:max-h-[880px]"
          >
            <Masonry columns={5} label="Effects">
              {effects.slice(0, 12).map((effect) => (
                <MasonryItem key={effect.slug}>
                  <EffectTile effect={effect} cta="Recreate" />
                </MasonryItem>
              ))}
            </Masonry>
          </FadeClamp>
        </section>
      ) : null}

      {/* ── Models strip ─────────────────────────────────────────────────── */}
      <section
        aria-labelledby="models-title"
        className="mx-auto w-full max-w-[1440px] px-4"
      >
        <SectionHeader
          id="models-title"
          title="Models"
          description="The best image and video models in one place. Pick a family to open it in the generator."
        />
        <ScrollRow label="Model families">
          {modelFamilies.map(({ lead, count }) => {
            const loop =
              lead.surface === "video" ? FAMILY_LOOPS[lead.family] : undefined
            const cover = familyCover(lead.family, lead.surface)
            return (
              <li
                key={`${lead.surface}:${lead.family}`}
                className="w-[260px] shrink-0 snap-start md:w-[300px]"
              >
                <Link
                  href={generatorHref(lead)}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-hairline bg-surface transition-colors duration-200 hover:bg-raised"
                >
                  <span className="relative block aspect-video overflow-hidden bg-raised">
                    <TileMedia
                      image={cover}
                      video={loop}
                      poster={cover}
                      className="transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </span>
                  <span className="flex flex-1 flex-col gap-1.5 p-4">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <ModelGlyph model={lead} className="size-4" />
                        <span className="truncate text-[15px] font-semibold text-white">
                          {lead.family}
                        </span>
                      </span>
                      <SurfaceChip surface={lead.surface} />
                    </span>
                    <span className="line-clamp-2 text-[13px] leading-[18px] text-muted-foreground">
                      {lead.bestFor ?? lead.description}
                    </span>
                    <span className="mt-auto pt-1 text-xs text-white/50">
                      {count} {count === 1 ? "model" : "models"} · starts with{" "}
                      {lead.label}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ScrollRow>
      </section>

      {/* ── Templates ────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="templates-title"
        className="mx-auto w-full max-w-[1440px] px-4"
      >
        <SectionHeader
          id="templates-title"
          title="Templates"
          description="Premade recipes from BRIX, plus the ones you save. One click loads the model, prompt and settings."
          action={
            <Link
              href="/templates"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/5 px-4 text-sm font-medium transition-colors hover:bg-white/10"
            >
              Browse templates <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          }
        />
        {templates.length > 0 ? (
          <ScrollRow label="Templates">
            {templates.map((template) => (
              <li
                key={template.id}
                className="w-[200px] shrink-0 snap-start md:w-[240px]"
              >
                <Link
                  href="/templates"
                  className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-gradient-to-br from-brix-main/40 via-raised to-page"
                >
                  {template.coverUrl ? (
                    <TileMedia image={template.coverUrl} />
                  ) : null}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10">
                    <span className="font-display block truncate text-sm text-white">
                      {template.title}
                    </span>
                    <span className="block truncate text-xs text-white/70">
                      {template.modelLabel}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ScrollRow>
        ) : (
          <EmptyCard
            headingLevel={3}
            icon={<Users className="size-5" aria-hidden />}
            title="Templates are on their way"
            body="Premade BRIX templates land here. You can already save your own from the generator."
            action={
              <Link
                href="/templates"
                className="btn-keycap inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold"
              >
                <Sparkles className="size-4" aria-hidden /> Open templates
              </Link>
            }
          />
        )}
      </section>

      {/* ── Closing banner ───────────────────────────────────────────────── */}
      <section
        aria-labelledby="cta-title"
        className="mx-auto w-full max-w-[1440px] px-4"
      >
        <div className="relative isolate flex min-h-[380px] flex-col justify-end gap-5 overflow-hidden rounded-3xl border border-hairline p-6 md:min-h-[440px] md:justify-center md:p-14">
          <img
            src={HERO.image}
            alt=""
            width={1800}
            height={1012}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 -z-20 size-full object-cover object-[60%_70%]"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/50 to-black/10 md:bg-gradient-to-r md:from-black/85 md:via-black/45 md:to-transparent" />
          <h2
            id="cta-title"
            className="font-display text-[36px] leading-[0.95] text-white md:text-[56px]"
          >
            Your next shot
            <br />
            <span className="text-lime">starts with a sentence.</span>
          </h2>
          <p className="max-w-[440px] text-sm text-white/75 md:text-base">
            Describe it, pick a model, press Generate. Keep the takes you love
            in your library and publish the best ones.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/video"
              className="btn-keycap inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold"
            >
              <Sparkles className="size-4" aria-hidden /> Start creating
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 bg-black/30 px-6 text-base font-medium text-white backdrop-blur-md transition-colors hover:bg-black/50"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
