import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { CheckCircle2, Sparkle } from "lucide-react"

import { PortalButton } from "@/components/account/portal-button"
import { TopupGrid } from "@/components/billing/plan-cards"
import { getAccount } from "@/lib/account"
import { currentUser } from "@/lib/auth/session"
import { PLANS } from "@/lib/billing/plans"
import { isSupabaseBackend } from "@/lib/backend"

export const metadata: Metadata = { title: "Billing" }

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  if (isSupabaseBackend()) redirect("/account")
  const user = await currentUser()
  if (!user) redirect("/login?callbackUrl=/account/billing")
  const [account, { checkout }] = await Promise.all([
    getAccount(user.objectId),
    searchParams,
  ])
  const plan = PLANS[account.plan]
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link
          href="/account"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Account
        </Link>
        <h1 className="font-display text-4xl">Billing</h1>
      </header>

      {checkout === "success" ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-lime/30 bg-lime/10 p-4 text-sm"
        >
          <CheckCircle2 className="size-5 text-lime" />
          Payment received. Credits appear as soon as Stripe confirms — usually
          within seconds.
        </p>
      ) : null}

      <section className="grid gap-4 rounded-2xl bg-surface p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Current plan</p>
          <p className="font-display text-3xl">{plan.name}</p>
          <p className="text-sm text-muted-foreground">
            {account.plan === "free"
              ? "No subscription. Top-ups and your sign-up credits are available."
              : `${plan.monthlyCredits.toLocaleString("en-US")} credits a month · billed ${
                  account.planInterval === "year" ? "annually" : "monthly"
                }${account.planRenewsAt ? ` · renews ${new Date(account.planRenewsAt).toLocaleDateString()}` : ""}`}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-sm">
            <Sparkle className="size-4 fill-lime text-lime" /> Balance{" "}
            <span className="font-mono tabular-nums">
              {account.total.toLocaleString("en-US")}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {account.hasBillingAccount ? <PortalButton /> : null}
          <Link
            href="/pricing"
            className="btn-keycap flex h-11 items-center rounded-xl px-5 text-sm font-semibold"
          >
            {account.plan === "free" ? "Choose a plan" : "Compare plans"}
          </Link>
        </div>
      </section>

      {!account.billingEnabled ? (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">
          Payments aren&apos;t configured on this server yet (STRIPE_SECRET_KEY
          is empty).
        </p>
      ) : null}

      <section id="topups" className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Top up credits</h2>
          <p className="text-sm text-muted-foreground">
            One-time packs that never expire.{" "}
            {plan.topupMultiplier > 1
              ? `Your ${plan.name} plan adds a ${Math.round((plan.topupMultiplier - 1) * 100)}% bonus.`
              : "Paid plans add a bonus to every pack."}
          </p>
        </div>
        <TopupGrid currentPlan={account.plan} />
      </section>

      <section className="rounded-2xl bg-surface p-5 text-sm text-muted-foreground">
        Invoices, payment methods, plan changes and cancellation are handled in
        the secure Stripe customer portal. Canceling keeps your plan credits
        until the end of the paid period.
      </section>
    </div>
  )
}
