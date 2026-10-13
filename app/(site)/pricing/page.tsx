import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { ChevronDown, Sparkles } from "lucide-react"

import { Atmosphere } from "@/components/marketing/atmosphere"
import { PricingView } from "@/components/marketing/pricing-view"
import { BRAND } from "@/lib/brand"
import { PLANS } from "@/lib/billing/plans"
import { isSupabaseBackend } from "@/lib/backend"

export const metadata: Metadata = {
  title: "Pricing",
  description: isSupabaseBackend()
    ? "Use your own Higgsfield API key and API balance in BRIX."
    : `Plans and credit top-ups for ${BRAND.name}. Every plan unlocks every image and video model.`,
}

const plus = PLANS.plus

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "What are credits?",
    a: (
      <>
        Credits are how you pay for generations on {BRAND.name}. One balance
        covers every image and video model, and the Generate button always shows
        exactly how many credits a run will cost before you press it.
      </>
    ),
  },
  {
    q: "How is each generation priced?",
    a: (
      <>
        Every model has its own rate. Images are priced per image, and options
        like quality or resolution can change the price. Video is priced by the
        length of the clip, so longer shots cost more, and higher resolutions or
        native sound can add to it. Change a setting and the price on the
        Generate button updates straight away.
      </>
    ),
  },
  {
    q: "Do unused credits roll over?",
    a: (
      <>
        Plan credits refill at every monthly renewal: your plan balance is reset
        to the monthly allowance, so unused plan credits don&apos;t carry over.
        Annual plans refill monthly too. Top-up credits are different: they
        never expire, and we only spend them once your plan credits run out.
      </>
    ),
  },
  {
    q: "What happens if a generation fails or gets blocked?",
    a: (
      <>
        You get the credits back automatically. If a run fails, is canceled, or
        is stopped by our content filter, its full cost returns to your balance.
        No support ticket needed.
      </>
    ),
  },
  {
    q: "Can I cancel any time?",
    a: (
      <>
        Yes. Cancel from Account → Billing and your plan stays active until the
        end of the period you&apos;ve paid for, so you can keep using its
        credits until then. Top-up credits stay in your account after you
        cancel.
      </>
    ),
  },
  {
    q: "Can I use what I make commercially?",
    a: (
      <>
        Paid plans include commercial use of your generations: ads, client work,
        products and channels. The Free plan is for personal projects. On any
        plan you&apos;re responsible for the prompts and references you upload.
        See our{" "}
        <Link
          href="/legal/acceptable-use"
          className="text-foreground underline underline-offset-2"
        >
          acceptable use policy
        </Link>
        .
      </>
    ),
  },
  {
    q: "How do parallel generations work?",
    a: (
      <>
        Each plan can run a set number of generations at the same time.{" "}
        {plus.name}, for example, runs {plus.concurrency.video} videos and{" "}
        {plus.concurrency.image} images at once. When you reach the limit, wait
        for one to finish before starting the next. Waiting never costs anything
        extra.
      </>
    ),
  },
  {
    q: "Do I need a subscription to start?",
    a: (
      <>
        No. Create a free account to explore every model, then buy a top-up pack
        whenever you need credits. Subscribe when you create often enough for
        the monthly credits and extras to pay off.
      </>
    ),
  },
]

export default function PricingPage() {
  if (isSupabaseBackend())
    return (
      <div className="studio-backdrop mx-auto flex max-w-4xl flex-col gap-6 px-6 py-16">
        <h1 className="font-display text-5xl">Your key. Your API balance.</h1>
        <p className="text-lg text-muted-foreground">
          Sign in with email, connect your Higgsfield API key, then create
          images and videos from this studio.
        </p>
        <p>
          Higgsfield charges your API account for generation. BRIX does not
          debit studio generation credits in this setup. A Higgsfield
          subscription login is not needed.
        </p>
        <Link
          href="/account"
          className="btn-keycap flex h-12 w-fit items-center rounded-xl px-6 font-semibold"
        >
          Connect your API key
        </Link>
      </div>
    )
  return (
    <div className="relative isolate">
      <Atmosphere glow="top" className="-z-10 h-[520px]" />
      <div className="mx-auto flex max-w-[1096px] flex-col gap-16 px-4 pt-10 md:gap-24 md:pt-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-[36px] leading-[1.1] font-semibold tracking-[-0.02em] md:text-[48px]">
            Pick the pace you create at
          </h1>
          <p className="max-w-[620px] text-sm text-muted-foreground md:text-base">
            Every plan unlocks every model. Choose how many credits you want
            each month, and top up whenever a project needs more.
          </p>
        </header>

        <PricingView />

        <section
          aria-labelledby="faq-title"
          className="flex flex-col items-center gap-8"
        >
          <h2
            id="faq-title"
            className="font-display text-center text-[28px] leading-9 md:text-[40px] md:leading-[48px]"
          >
            Questions, answered
          </h2>
          <div className="flex w-full max-w-[640px] flex-col gap-2">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl bg-surface open:bg-raised/60"
              >
                <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown
                    className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <p className="px-5 pb-5 text-sm leading-6 text-muted-foreground">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="ready-title"
          className="relative isolate flex flex-col items-center gap-5 overflow-hidden rounded-3xl border border-hairline bg-panel px-6 py-14 text-center"
        >
          <Atmosphere glow="bottom" className="-z-10" />
          <h2
            id="ready-title"
            className="font-display text-[36px] leading-none md:text-[48px]"
          >
            Ready to <span className="text-lime">create?</span>
          </h2>
          <p className="max-w-[440px] text-sm text-muted-foreground">
            Open the studio, pick a model and make your first shot. You can
            choose a plan whenever you&apos;re ready.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/video"
              className="btn-keycap inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold"
            >
              <Sparkles className="size-4" aria-hidden /> Start creating
            </Link>
            <Link
              href="#plans"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 px-6 text-base font-medium transition-colors hover:bg-white/5"
            >
              Back to plans
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
