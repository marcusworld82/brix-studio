"use client"

import { useState } from "react"
import {
  ArrowRight,
  Check,
  ChevronDown,
  Film,
  ImageIcon,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"
import { checkoutAction } from "@/app/actions/billing"
import { useApp, useToast } from "@/components/providers/app-providers"
import { PAID_PLANS, type BillingInterval } from "@/lib/billing/plans"
import { BRAND } from "@/lib/brand"
import s from "./subscription-pricing.module.css"

type PaidPlan = (typeof PAID_PLANS)[number]
type PaidPlanId = "starter" | "plus" | "ultra"
export interface SubscriptionPricingProps {
  checkoutReady: boolean
  supportEmail?: string
}
const number = (value: number) => value.toLocaleString("en-US")
const dollars = (value: number) =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`

/** Pricing content only. The existing site layout supplies BRIX's nav and footer. */
export function SubscriptionPricing({
  checkoutReady,
  supportEmail = BRAND.supportEmail,
}: SubscriptionPricingProps) {
  const [interval, setInterval] = useState<BillingInterval>("month")
  const [audience, setAudience] = useState<"individual" | "business">(
    "individual"
  )
  const [selected, setSelected] = useState<PaidPlanId>("plus")
  const [pending, setPending] = useState<PaidPlanId | null>(null)
  const [notice, setNotice] = useState("")
  const { user, openAuth } = useApp()
  const toast = useToast()
  const contact = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(supportEmail)
    ? supportEmail
    : ""
  const selectedPlan = PAID_PLANS.find((plan) => plan.id === selected)!
  const price = (plan: PaidPlan) =>
    interval === "year" ? plan.priceAnnualPerMonth : plan.priceMonthly

  async function choose(plan: PaidPlan) {
    setSelected(plan.id as PaidPlanId)
    if (!checkoutReady) {
      setNotice(
        `${plan.name}: ${number(plan.monthlyCredits)} credits per month, ${dollars(price(plan))} per month${interval === "year" ? `, billed ${dollars(price(plan) * 12)} annually` : ", billed monthly"}. Preview pricing. Checkout is not connected.`
      )
      return
    }
    if (!user) {
      openAuth({ mode: "signup", reason: `Sign in to choose ${plan.name}.` })
      return
    }
    setPending(plan.id as PaidPlanId)
    try {
      const result = await checkoutAction({
        kind: "plan",
        plan: plan.id as PaidPlanId,
        interval,
      })
      if (result.ok) {
        const destination = new URL(result.data.url)
        if (destination.protocol !== "https:")
          throw new Error("Invalid checkout destination")
        window.location.assign(destination.href)
      } else toast.error("Checkout didn't start", result.error)
    } catch {
      toast.error(
        "Checkout didn't start",
        "Please try again. No plan was changed."
      )
    } finally {
      setPending(null)
    }
  }

  function teamsCard() {
    return (
      <article
        className={`${s.card} ${s.teamsCard}`}
        aria-labelledby="teams-plan-title"
      >
        <div className={s.cardTop}>
          <span className={s.tierEyebrow}>For your business</span>
          <h2 id="teams-plan-title">Teams</h2>
          <p>Discuss your studio&apos;s needs.</p>
        </div>
        <div className={s.priceBlock}>
          <strong className={s.contactPrice}>Let&apos;s talk</strong>
          <span>Pricing available on request</span>
        </div>
        <div className={s.creditAllocation}>
          <Users size={17} aria-hidden="true" />
          <strong>Plan your setup</strong>
        </div>
        {contact ? (
          <a
            className={s.teamAction}
            href={`mailto:${encodeURIComponent(contact)}?subject=BRIX%20Teams%20enquiry`}
          >
            Contact sales <ArrowRight size={16} aria-hidden="true" />
          </a>
        ) : (
          <button type="button" className={s.teamAction} disabled>
            Contact sales not configured
          </button>
        )}
        <div className={s.featureIntro}>Start with a conversation</div>
        <ul className={s.features}>
          <li>
            <Check size={15} aria-hidden="true" />
            <span>Discuss your credit needs</span>
          </li>
          <li>
            <Check size={15} aria-hidden="true" />
            <span>Review image and video workflows</span>
          </li>
          <li>
            <Check size={15} aria-hidden="true" />
            <span>Confirm a suitable billing setup</span>
          </li>
        </ul>
        <div className={s.teamBoundary}>
          <ShieldCheck size={16} aria-hidden="true" />
          <p>
            Multi-seat access and shared credits are not configured. Contact
            does not create a team account.
          </p>
        </div>
      </article>
    )
  }

  return (
    <div className={s.pricing}>
      <section className={s.contextStrip} aria-label="Plan context">
        <Sparkles size={18} aria-hidden="true" />
        <p>
          Your ideas. Your creative pace.
          <span> Monthly credits for the BRIX studio you already know.</span>
        </p>
        <a href="#subscription-plans">
          Explore plans <ArrowRight size={14} aria-hidden="true" />
        </a>
      </section>
      <header className={s.heading}>
        <div className={s.headingContext}>
          <span>BRIX MEMBERSHIP</span>
          {!checkoutReady && (
            <span className={s.previewBadge}>Preview pricing</span>
          )}
        </div>
        <h1>More room to create.</h1>
        <p>
          Choose your monthly credits. Keep creating in one image and video
          studio.
        </p>
      </header>
      <section
        id="subscription-plans"
        aria-label="Subscription plans"
        className={s.planSection}
      >
        <div className={s.controls}>
          <div className={s.audience} role="group" aria-label="Plan audience">
            <button
              type="button"
              aria-pressed={audience === "individual"}
              onClick={() => {
                setAudience("individual")
                setNotice("")
              }}
            >
              Individual
            </button>
            <button
              type="button"
              aria-pressed={audience === "business"}
              onClick={() => {
                setAudience("business")
                setNotice("")
              }}
            >
              Business
            </button>
          </div>
          {audience === "individual" && (
            <div
              className={s.billing}
              role="group"
              aria-label="Billing interval"
            >
              <button
                type="button"
                aria-pressed={interval === "month"}
                onClick={() => {
                  setInterval("month")
                  setNotice("")
                }}
              >
                Monthly
              </button>
              <button
                type="button"
                aria-pressed={interval === "year"}
                onClick={() => {
                  setInterval("year")
                  setNotice("")
                }}
              >
                Annually
              </button>
            </div>
          )}
        </div>
        {notice && (
          <div className={s.notice} role="status">
            {notice}
          </div>
        )}
        {audience === "individual" ? (
          <>
            <div className={s.creditPicker}>
              <label htmlFor="monthly-credit-allowance">
                Find your monthly allowance
              </label>
              <div className={s.selectWrap}>
                <select
                  id="monthly-credit-allowance"
                  value={selected}
                  onChange={(event) =>
                    setSelected(event.target.value as PaidPlanId)
                  }
                >
                  {PAID_PLANS.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {number(plan.monthlyCredits)} credits / month ·{" "}
                      {plan.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </div>
              <p>
                {selectedPlan.name}:{" "}
                <strong>{dollars(price(selectedPlan))}</strong> / month
                {!checkoutReady ? ", preview" : ""}
              </p>
            </div>
            <div className={s.grid}>
              {PAID_PLANS.map((plan) => (
                <article
                  className={`${s.card} ${selected === plan.id ? s.selected : ""}`}
                  key={plan.id}
                  aria-labelledby={`${plan.id}-plan-title`}
                >
                  <div className={s.cardTop}>
                    <span className={s.tierEyebrow}>
                      {plan.id === "starter"
                        ? "Start your next idea"
                        : plan.id === "plus"
                          ? "Keep your ideas moving"
                          : "For a higher creative output"}
                    </span>
                    <h2 id={`${plan.id}-plan-title`}>{plan.name}</h2>
                    <p>
                      {plan.id === "starter"
                        ? "For creators getting started."
                        : plan.id === "plus"
                          ? "For creators making every day."
                          : "For studios creating at scale."}
                    </p>
                  </div>
                  <div className={s.priceBlock}>
                    <div>
                      <strong>{dollars(price(plan))}</strong>
                      <span> / month</span>
                    </div>
                    <span>
                      {interval === "year"
                        ? `${dollars(plan.priceAnnualPerMonth * 12)} billed annually`
                        : "Billed monthly"}
                      {!checkoutReady ? " · Preview" : ""}
                    </span>
                  </div>
                  <div className={s.creditAllocation}>
                    <Sparkles size={17} aria-hidden="true" />
                    <strong>
                      {number(plan.monthlyCredits)} <span>credits / month</span>
                    </strong>
                  </div>
                  <button
                    className={
                      plan.id === "plus" ? s.planActionPrimary : s.planAction
                    }
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void choose(plan)}
                  >
                    {pending === plan.id ? (
                      <Loader2
                        size={16}
                        aria-hidden="true"
                        className={s.spinner}
                      />
                    ) : null}
                    {checkoutReady
                      ? `Choose ${plan.name}`
                      : `Preview ${plan.name}`}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                  <div className={s.featureIntro}>Your studio includes</div>
                  <ul className={s.features}>
                    <li>
                      <Check size={15} aria-hidden="true" />
                      <span>
                        {number(plan.monthlyCredits)} credits allocated monthly
                      </span>
                    </li>
                    <li>
                      <Check size={15} aria-hidden="true" />
                      <span>Image and video model catalog</span>
                    </li>
                    <li>
                      <Check size={15} aria-hidden="true" />
                      <span>Private library and projects</span>
                    </li>
                    <li>
                      <Check size={15} aria-hidden="true" />
                      <span>Save your own templates</span>
                    </li>
                  </ul>
                  <div className={s.concurrency}>
                    <span>Parallel generation limits</span>
                    <div>
                      <span>
                        <ImageIcon size={14} aria-hidden="true" />
                        {plan.concurrency.image} images
                      </span>
                      <span>
                        <Film size={14} aria-hidden="true" />
                        {plan.concurrency.video} videos
                      </span>
                    </div>
                  </div>
                </article>
              ))}
              {teamsCard()}
            </div>
            <p className={s.pricingNote}>
              USD pricing. Annual plans show the monthly equivalent and bill the
              full annual amount.{" "}
              {checkoutReady
                ? "Final price is confirmed at checkout."
                : "These are existing plan defaults for review. No subscription starts from this preview."}
            </p>
          </>
        ) : (
          <div className={s.businessLayout}>
            <div className={s.businessCopy}>
              <span className={s.tierEyebrow}>Business enquiries</span>
              <h2>Build around the way you create.</h2>
              <p>
                Tell us your expected image and video volume, who needs access,
                and how you want to be billed.
              </p>
              <p>
                Teams pricing and multi-user features need a separate agreement.
                Individual plans remain available for a single account.
              </p>
              <button
                className={s.backAction}
                type="button"
                onClick={() => setAudience("individual")}
              >
                Compare individual plans{" "}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
            {teamsCard()}
          </div>
        )}
      </section>
      <section className={s.faq} aria-labelledby="pricing-details-heading">
        <h2 id="pricing-details-heading">Before you choose</h2>
        <div>
          <details>
            <summary>
              What does one credit create?
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <p>
              Generation cost depends on the model and settings. Check the
              studio&apos;s credit estimate before submitting. Monthly credits
              are an allowance, not a promise of a fixed number of images or
              videos.
            </p>
          </details>
          <details>
            <summary>
              Does a plan include unlimited generations?
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <p>
              No unlimited allowance is advertised here. Your plan defines the
              monthly credits and parallel limits shown above. Output use also
              remains subject to the model provider&apos;s terms.
            </p>
          </details>
          <details>
            <summary>
              Can I buy a plan right now?
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <p>
              {checkoutReady
                ? "Choose a plan to sign in and continue to the configured checkout. Review the amount and billing interval before confirming payment."
                : "This is preview pricing. Checkout is not connected, so choosing a plan only displays its price and allowance. No payment or subscription is created."}
            </p>
          </details>
        </div>
      </section>
    </div>
  )
}
