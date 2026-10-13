"use client"

import Link from "next/link"
import { Fragment, useState } from "react"
import { Check, ChevronDown, Loader2, X } from "lucide-react"

import {
  IntervalToggle,
  PlanGrid,
  TopupGrid,
  useCheckout,
} from "@/components/billing/plan-cards"
import { useApp } from "@/components/providers/app-providers"
import { activeSurfaces } from "@/generation/catalog"
import {
  PLANS,
  type BillingInterval,
  type Plan,
  type PlanId,
} from "@/lib/billing/plans"
import { cn } from "@/lib/utils"

const ORDER: PlanId[] = ["free", "starter", "plus", "ultra"]

function money(value: number): string {
  return value % 1 === 0 ? `$${value}` : `$${value.toFixed(2)}`
}

function hasFeature(plan: Plan, label: string): boolean {
  return plan.features.some(
    (feature) => feature.label === label && feature.included
  )
}

/** A value, a check / cross, or [full, compact] text for narrow screens. */
type Cell = string | boolean | readonly [string, string]
type Row = { label: string; hint?: string; values: (plan: Plan) => Cell }

function rowGroups(): { title: string; rows: Row[] }[] {
  const surfaces = activeSurfaces()
  const parallel: Row[] = [
    {
      label: "Parallel video generations",
      values: (plan) => String(plan.concurrency.video),
    },
    {
      label: "Parallel image generations",
      values: (plan) => String(plan.concurrency.image),
    },
  ]
  if (surfaces.includes("audio"))
    parallel.push({
      label: "Parallel audio generations",
      values: (plan) => String(plan.concurrency.audio),
    })
  return [
    {
      title: "Credits",
      rows: [
        {
          label: "Monthly credits",
          hint: "Refilled at every renewal",
          values: (plan) =>
            plan.monthlyCredits
              ? plan.monthlyCredits.toLocaleString("en-US")
              : (["Top-ups only", "—"] as const),
        },
        {
          label: "Top-up bonus",
          hint: "Extra credits on every pack",
          values: (plan) =>
            plan.topupMultiplier > 1
              ? `+${Math.round((plan.topupMultiplier - 1) * 100)}%`
              : false,
        },
      ],
    },
    {
      title: "Generation",
      rows: [
        ...parallel,
        { label: "Every image and video model", values: () => true },
        {
          label: "Priority queue",
          values: (plan) => hasFeature(plan, "Priority queue"),
        },
      ],
    },
    {
      title: "Rights & sharing",
      rows: [
        {
          label: "Commercial use",
          values: (plan) => hasFeature(plan, "Commercial use"),
        },
        { label: "Personal library & projects", values: () => true },
        { label: "Save your own templates", values: () => true },
      ],
    },
  ]
}

function CellValue({ value }: { value: Cell }) {
  if (value === true)
    return (
      <>
        <Check className="size-4 text-lime" aria-hidden />
        <span className="sr-only">Included</span>
      </>
    )
  if (value === false)
    return (
      <>
        <X className="size-4 text-white/30" aria-hidden />
        <span className="sr-only">Not included</span>
      </>
    )
  if (typeof value === "string")
    return <span className="tabular-nums">{value}</span>
  return (
    <>
      <span className="hidden tabular-nums md:inline">{value[0]}</span>
      <span className="tabular-nums md:hidden" aria-hidden>
        {value[1]}
      </span>
      <span className="sr-only md:hidden">{value[0]}</span>
    </>
  )
}

/** Free-plan CTA: sign up when signed out, otherwise go create. */
function FreeCta({ className }: { className?: string }) {
  const { user, openAuth } = useApp()
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold"
  if (user)
    return (
      <Link
        href="/video"
        className={cn(base, "btn-keycap-white hover:bg-white/90", className)}
      >
        Start creating
      </Link>
    )
  return (
    <button
      type="button"
      onClick={() => openAuth({ mode: "signup" })}
      className={cn(base, "btn-keycap-white hover:bg-white/90", className)}
    >
      Create free account
    </button>
  )
}

function FreeCard() {
  const free = PLANS.free
  return (
    <div className="flex flex-col gap-5 rounded-[20px] border border-white/10 bg-panel p-6 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-2xl">{free.name}</h3>
        <p className="text-sm text-muted-foreground">
          {free.tagline}. Buy credits only when you need them.
        </p>
      </div>
      <ul className="flex flex-wrap gap-2 text-sm">
        {free.features
          .filter((feature) => feature.included)
          .map((feature) => (
            <li
              key={feature.label}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/5 px-2.5 text-white/85"
            >
              <Check className="size-3.5 text-lime" aria-hidden />{" "}
              {feature.label}
            </li>
          ))}
      </ul>
      <div className="flex items-center gap-4 md:shrink-0">
        <span className="text-3xl font-bold tracking-tight">$0</span>
        <FreeCta className="h-11 px-5 text-sm" />
      </div>
    </div>
  )
}

function CompareTable({ interval }: { interval: BillingInterval }) {
  const { start, pending } = useCheckout()
  const groups = rowGroups()
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-left text-xs md:text-sm">
      <caption className="sr-only">Plan comparison</caption>
      <colgroup>
        <col className="w-[30%] md:w-[28%]" />
        {ORDER.map((id) => (
          <col key={id} />
        ))}
      </colgroup>
      <thead className="sticky top-[60px] z-10">
        <tr>
          <th
            scope="col"
            className="rounded-tl-3xl bg-panel px-3 pt-5 pb-4 align-bottom md:px-6"
          >
            <span className="sr-only">Feature</span>
            <span
              aria-hidden
              className="block text-[11px] font-normal text-muted-foreground md:hidden"
            >
              Price / month
            </span>
            <span className="hidden text-xs font-normal text-muted-foreground md:block">
              {interval === "year"
                ? "Prices per month, billed annually"
                : "Prices per month, billed monthly"}
            </span>
          </th>
          {ORDER.map((id, index) => {
            const plan = PLANS[id]
            const value =
              interval === "year" ? plan.priceAnnualPerMonth : plan.priceMonthly
            return (
              <th
                key={id}
                scope="col"
                className={cn(
                  "border-b border-white/5 bg-panel px-1.5 pt-5 pb-4 align-bottom font-normal md:px-3",
                  index === ORDER.length - 1 && "rounded-tr-3xl"
                )}
              >
                <span className="flex flex-col gap-1">
                  <span className="font-display text-[12px] md:text-xl">
                    {plan.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground md:text-sm">
                    {value ? (
                      <>
                        {money(value)}
                        <span className="hidden md:inline">/mo</span>
                      </>
                    ) : (
                      "Free"
                    )}
                  </span>
                  <span className="mt-2 hidden md:block">
                    {id === "free" ? (
                      <FreeCta className="h-9 w-full px-3 text-sm" />
                    ) : (
                      <button
                        type="button"
                        disabled={pending === `${id}:${interval}`}
                        onClick={() =>
                          void start({
                            kind: "plan",
                            plan: id as "starter" | "plus" | "ultra",
                            interval,
                          })
                        }
                        className={cn(
                          "flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold disabled:opacity-60",
                          id === "plus"
                            ? "btn-keycap"
                            : "bg-raised text-white hover:bg-hover"
                        )}
                      >
                        {pending === `${id}:${interval}` ? (
                          <Loader2
                            className="size-3.5 animate-spin"
                            aria-hidden
                          />
                        ) : null}
                        Get {plan.name}
                      </button>
                    )}
                  </span>
                </span>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <Fragment key={group.title}>
            <tr>
              <th
                scope="colgroup"
                colSpan={ORDER.length + 1}
                className="px-3 pt-7 pb-2 text-base font-semibold text-white md:px-6 md:text-lg"
              >
                {group.title}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-b border-white/5 px-3 py-3 align-middle font-normal md:px-6"
                >
                  <span className="block text-white">{row.label}</span>
                  {row.hint ? (
                    <span className="block text-[11px] text-muted-foreground md:text-xs">
                      {row.hint}
                    </span>
                  ) : null}
                </th>
                {ORDER.map((id) => (
                  <td
                    key={id}
                    className="border-b border-white/5 px-1.5 py-3 align-middle text-white/90 md:px-3"
                  >
                    <CellValue value={row.values(PLANS[id])} />
                  </td>
                ))}
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

/** Interval toggle, plan cards, top-ups and the collapsible comparison table. */
export function PricingView() {
  const [interval, setBillingInterval] = useState<BillingInterval>("year")
  const [compareOpen, setCompareOpen] = useState(false)
  return (
    <div className="flex flex-col gap-16 md:gap-20">
      <section
        id="plans"
        aria-labelledby="plans-title"
        className="flex scroll-mt-24 flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="plans-title" className="text-lg font-semibold">
            Plans
          </h2>
          <IntervalToggle value={interval} onChange={setBillingInterval} />
        </div>
        <FreeCard />
        <PlanGrid interval={interval} />
        <p className="text-xs text-muted-foreground">
          Plan prices are in USD. Taxes may apply at checkout. Cancel any time
          from Account → Billing.
        </p>
      </section>

      <section
        id="topups"
        aria-labelledby="topups-title"
        className="flex scroll-mt-24 flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <h2
            id="topups-title"
            className="font-display text-[28px] leading-9 text-white"
          >
            Top up credits
          </h2>
          <p className="text-sm text-muted-foreground">
            One-off packs for busy weeks. Top-up credits never expire, and paid
            plans add a bonus to every pack.
          </p>
        </div>
        <TopupGrid />
      </section>

      <section
        aria-labelledby="compare-title"
        className="flex flex-col items-center gap-6"
      >
        <div className="flex flex-col items-center gap-1.5 text-center">
          <h2
            id="compare-title"
            className="font-display text-[28px] leading-9 text-white md:text-[40px] md:leading-[48px]"
          >
            Compare plans
          </h2>
          <p className="text-sm text-muted-foreground">
            Every limit, side by side.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={compareOpen}
          aria-controls="compare-table"
          onClick={() => setCompareOpen((open) => !open)}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 px-5 text-sm font-semibold transition-colors hover:bg-white/5"
        >
          {compareOpen ? "Hide comparison" : "Compare features"}
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              compareOpen && "rotate-180"
            )}
            aria-hidden
          />
        </button>
        <div
          id="compare-table"
          hidden={!compareOpen}
          className="w-full rounded-3xl border border-hairline bg-panel pb-4"
        >
          {compareOpen ? <CompareTable interval={interval} /> : null}
        </div>
      </section>
    </div>
  )
}
