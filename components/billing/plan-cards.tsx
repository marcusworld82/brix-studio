"use client"

import { useState } from "react"
import { Check, Loader2, Sparkle, X } from "lucide-react"

import { checkoutAction } from "@/app/actions/billing"
import { useApp, useToast } from "@/components/providers/app-providers"
import {
  annualSavingsPercent,
  PAID_PLANS,
  PLANS,
  TOPUPS,
  type BillingInterval,
  type Plan,
  type TopupId,
} from "@/lib/billing/plans"
import { cn } from "@/lib/utils"

type Checkout =
  | {
      kind: "plan"
      plan: "starter" | "plus" | "ultra"
      interval: BillingInterval
    }
  | { kind: "topup"; pack: TopupId }

/** Start Stripe Checkout (after sign-in if needed). */
export function useCheckout() {
  const { user, openAuth } = useApp()
  const toast = useToast()
  const [pending, setPending] = useState<string | null>(null)
  const start = async (input: Checkout) => {
    const key =
      input.kind === "plan" ? `${input.plan}:${input.interval}` : input.pack
    if (!user) {
      openAuth({
        mode: "signup",
        reason: "Create an account to choose a plan.",
      })
      return
    }
    setPending(key)
    const result = await checkoutAction(input)
    if (result.ok) {
      window.location.assign(result.data.url)
      return
    }
    setPending(null)
    toast.error("Checkout didn't start", result.error)
  }
  return { start, pending }
}

export function IntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval
  onChange: (value: BillingInterval) => void
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span
        className={
          value === "month" ? "text-foreground" : "text-muted-foreground"
        }
      >
        Monthly
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value === "year"}
        aria-label="Bill annually"
        onClick={() => onChange(value === "year" ? "month" : "year")}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          value === "year" ? "bg-lime" : "bg-[#3a3d42]"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform",
            value === "year" && "translate-x-4"
          )}
        />
      </button>
      <span
        className={
          value === "year" ? "text-foreground" : "text-muted-foreground"
        }
      >
        Annual
      </span>
      <span className="font-display rounded bg-pink-strong px-1.5 py-0.5 text-[11px] text-white italic">
        20% OFF
      </span>
    </div>
  )
}

const TONE: Record<string, string> = {
  starter: "from-white/[0.06] to-transparent",
  plus: "from-lime/[0.14] to-transparent",
  ultra: "from-pink/[0.16] to-transparent",
}

function price(plan: Plan, interval: BillingInterval): string {
  const value =
    interval === "year" ? plan.priceAnnualPerMonth : plan.priceMonthly
  return value % 1 === 0 ? `$${value}` : `$${value.toFixed(2)}`
}

export function PlanCard({
  plan,
  interval,
  current,
  onChoose,
  pending,
  compact = false,
}: {
  plan: Plan
  interval: BillingInterval
  current?: boolean
  onChoose: () => void
  pending?: boolean
  compact?: boolean
}) {
  const savings = annualSavingsPercent(plan)
  return (
    <div
      className={cn(
        "relative flex flex-col gap-5 overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-b p-6",
        TONE[plan.id] ?? "from-white/[0.03] to-transparent",
        plan.badge === "MOST POPULAR" && "border-lime/40"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-2xl">{plan.name}</h3>
        {interval === "year" && savings ? (
          <span className="font-display rounded bg-pink-strong px-1.5 py-0.5 text-[11px] text-white italic">
            {savings}% OFF
          </span>
        ) : null}
        {plan.badge ? (
          <span
            className={cn(
              "font-display rounded px-1.5 py-0.5 text-[11px] italic",
              plan.badge === "MOST POPULAR"
                ? "bg-lime text-white"
                : "bg-[#0256fe] text-white"
            )}
          >
            {plan.badge}
          </span>
        ) : null}
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">{plan.tagline}</p>
      <div className="rounded-xl bg-black/20 p-4">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold">
          <Sparkle className="size-4 fill-lime text-lime" />{" "}
          {plan.monthlyCredits.toLocaleString("en-US")} credits/mo.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          ≈ {Math.floor(plan.monthlyCredits / 18).toLocaleString("en-US")}{" "}
          images or{" "}
          {Math.floor(plan.monthlyCredits / 100).toLocaleString("en-US")}{" "}
          five-second videos
        </p>
      </div>
      <div>
        <p className="flex items-baseline gap-2">
          {interval === "year" ? (
            <span className="text-lg text-pink line-through">
              ${plan.priceMonthly}
            </span>
          ) : null}
          <span className="text-4xl font-bold tracking-tight">
            {price(plan, interval)}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          per month
          {interval === "year" ? ", billed annually" : ", billed monthly"}
        </p>
      </div>
      <button
        type="button"
        disabled={pending || current}
        onClick={onChoose}
        className={cn(
          "flex h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
          plan.id === "plus"
            ? "btn-keycap"
            : plan.id === "ultra"
              ? "bg-gradient-to-b from-[#e8005a] to-[#c20044] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.3)]"
              : "btn-keycap-white"
        )}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {current ? "Current plan" : `Get ${plan.name}`}
      </button>
      {interval === "year" ? (
        <p className="-mt-3 text-center text-xs text-muted-foreground">
          Save $
          {Math.round((plan.priceMonthly - plan.priceAnnualPerMonth) * 12)} a
          year vs monthly
        </p>
      ) : null}
      {!compact ? (
        <ul className="flex flex-col gap-2.5 text-sm">
          {plan.features.map((feature) => (
            <li
              key={feature.label}
              className={cn(
                "flex items-start gap-2",
                !feature.included && "text-muted-foreground/60"
              )}
            >
              {feature.included ? (
                <Check className="mt-0.5 size-4 shrink-0 text-lime" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0" />
              )}
              <span>{feature.label}</span>
              {feature.tag ? (
                <span className="font-display rounded bg-lime/15 px-1.5 py-0.5 text-[10px] text-lime italic">
                  {feature.tag}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function PlanGrid({
  interval,
  currentPlan,
  compact,
}: {
  interval: BillingInterval
  currentPlan?: string
  compact?: boolean
}) {
  const { start, pending } = useCheckout()
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PAID_PLANS.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          interval={interval}
          compact={compact}
          current={currentPlan === plan.id}
          pending={pending === `${plan.id}:${interval}`}
          onChoose={() =>
            void start({
              kind: "plan",
              plan: plan.id as "starter" | "plus" | "ultra",
              interval,
            })
          }
        />
      ))}
    </div>
  )
}

export function TopupGrid({ currentPlan }: { currentPlan?: string }) {
  const { start, pending } = useCheckout()
  const plan =
    PLANS[(currentPlan as keyof typeof PLANS) ?? "free"] ?? PLANS.free
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {Object.values(TOPUPS).map((pack) => {
        const credits = Math.floor(pack.credits * plan.topupMultiplier)
        return (
          <button
            key={pack.id}
            type="button"
            disabled={pending === pack.id}
            onClick={() => void start({ kind: "topup", pack: pack.id })}
            className="group flex flex-col items-start gap-2 rounded-2xl border border-white/10 bg-surface p-5 text-left transition-colors hover:border-lime/40 disabled:opacity-60"
          >
            <span className="font-display text-lg">{pack.name}</span>
            <span className="flex items-center gap-1.5 text-2xl font-bold">
              <Sparkle className="size-5 fill-lime text-lime" />{" "}
              {credits.toLocaleString("en-US")}
            </span>
            <span className="text-sm text-muted-foreground">
              ${pack.price} · ${((pack.price / credits) * 100).toFixed(2)} per
              100 credits
            </span>
            {plan.topupMultiplier > 1 ? (
              <span className="rounded bg-lime/15 px-1.5 py-0.5 text-xs text-lime">
                +{Math.round((plan.topupMultiplier - 1) * 100)}% {plan.name}{" "}
                bonus
              </span>
            ) : null}
            <span className="mt-1 flex items-center gap-1.5 text-sm font-medium text-lime">
              {pending === pack.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              Buy credits →
            </span>
          </button>
        )
      })}
    </div>
  )
}
