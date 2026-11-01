"use client"
import { useEffect, useState } from "react"
import Image from "next/image"
import { ImageIcon, Film, Search } from "lucide-react"
import {
  getSubscriptionPricingAction,
  getAdminModelCostAction,
  saveManualModelPricesAction,
} from "@/app/actions/subscription-admin"
import {
  pricingComparison,
  type AdminPricingModel,
} from "@/lib/billing/admin-model-pricing"
import {
  creditsFromCustomerPrice,
  type SubscriptionRateUnit,
} from "@/lib/billing/subscription-rate"
import { PAID_PLANS } from "@/lib/billing/plans"
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(n)
const field =
  "rounded-lg border border-white/15 bg-black/25 px-2.5 py-2 text-sm outline-none focus:border-white/50 focus-visible:ring-2 focus-visible:ring-white/20"
type Draft = { usd: string; unit: SubscriptionRateUnit }
export function StripeSetupPlaceholder() {
  return (
    <section className="space-y-4 rounded-xl border border-white/10 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Stripe payments</h2>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-400">
          Not connected
        </span>
      </div>
      <p className="text-sm text-zinc-400">
        Your payment connection will be added later. Plan prices use the
        original BRIX plans. Customers cannot pay until Stripe is configured.
      </p>
      <label className="block text-sm">
        Stripe secret key
        <input
          type="password"
          disabled
          placeholder="Stripe connection coming later"
          autoComplete="off"
          className="mt-2 block w-full rounded-lg border border-white/10 bg-black/30 p-3 text-zinc-500"
        />
      </label>
      <button
        disabled
        className="rounded-lg bg-white/10 px-4 py-2 text-sm text-zinc-500"
      >
        Connect Stripe, coming later
      </button>
    </section>
  )
}
export function SubscriptionPricingSettings() {
  const [models, setModels] = useState<AdminPricingModel[]>([]),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [legacy, setLegacy] = useState<string[]>([]),
    [creditUsd, setCreditUsd] = useState(0.01),
    [version, setVersion] = useState<string | null>(null),
    [reviews, setReviews] = useState<{ userId: string; review: string }[]>([]),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState("all"),
    [selection, setSelection] = useState<Record<string, number>>({}),
    [seconds, setSeconds] = useState<Record<string, string>>({}),
    [images, setImages] = useState<Record<string, string>>({}),
    [basis, setBasis] = useState("plus:month"),
    [message, setMessage] = useState("Loading model prices..."),
    [setupMessage, setSetupMessage] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [ratesLoading, setRatesLoading] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getSubscriptionPricingAction()
      .then((r) => {
        if (!active) return
        if (!r.ok) {
          setMessage(r.error)
          return
        }
        const data = r.data
        setModels(
          data.models.filter(
            (m) => m.surface === "image" || m.surface === "video" || m.legacy
          )
        )
        setCreditUsd(data.creditUsd)
        setVersion(data.version)
        setReviews(data.billingReviews)
        setLegacy(Object.keys(data.modelMarkups))
        setDrafts(
          Object.fromEntries(
            Object.entries(data.fixedCredits).map(([id, credits]) => [
              id,
              {
                usd: String(Number((credits * data.creditUsd).toFixed(8))),
                unit: data.rateUnits[id] ?? "generation",
              },
            ])
          )
        )
        setSetupMessage(data.setupMessage)
        setReady(data.pricingReady)
        setMessage("")
      })
      .catch(() => {
        if (active)
          setMessage("Model prices could not load. Refresh to try again.")
      })
    return () => {
      active = false
    }
  }, [])
  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({
      ...d,
      [id]: {
        usd: d[id]?.usd ?? "",
        unit: d[id]?.unit ?? "generation",
        ...patch,
      },
    }))
  const [planId, interval] = basis.split(":")
  const selectedPlan = PAID_PLANS.find((p) => p.id === planId)
  const revenuePerCredit = selectedPlan
    ? (interval === "year"
        ? selectedPlan.priceAnnualPerMonth
        : selectedPlan.priceMonthly) / selectedPlan.monthlyCredits
    : creditUsd
  const filtered = models.filter(
    (m) =>
      (tab === "all" || m.surface === tab) &&
      `${m.label} ${m.id} ${m.provider}`
        .toLowerCase()
        .includes(search.toLowerCase())
  )
  async function save() {
    if (!version || !ready) return
    setBusy(true)
    try {
      const prices = Object.fromEntries(
        Object.entries(drafts)
          .filter(([, d]) => d.usd.trim() !== "")
          .map(([id, d]) => {
            const usd = Number(d.usd)
            creditsFromCustomerPrice(usd, creditUsd)
            return [id, { usd, unit: d.unit }]
          })
      )
      const result = await saveManualModelPricesAction({ version, prices })
      if (result.ok) {
        setVersion(result.data.version)
        setMessage("Customer prices saved.")
      } else setMessage(result.error)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Prices could not save. Check each customer price."
      )
    } finally {
      setBusy(false)
    }
  }
  async function loadRates(id: string) {
    setRatesLoading(id)
    try {
      const result = await getAdminModelCostAction(id)
      if (result.ok)
        setModels((current) =>
          current.map((m) => (m.id === id ? result.data : m))
        )
      else setMessage(result.error)
    } catch {
      setMessage("Provider rates are unavailable. Try again later.")
    } finally {
      setRatesLoading(null)
    }
  }
  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#101010]">
        <div className="flex flex-wrap items-start justify-between gap-5 p-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Models API pricing
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Compare provider rates, set your customer prices, and check the
              estimated gross profit for the same request.
            </p>
          </div>
          <button
            disabled={!ready || busy}
            onClick={save}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Saving..." : "Save customer prices"}
          </button>
        </div>
        {setupMessage && (
          <p
            role="status"
            className="mx-6 mb-5 rounded-lg border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-100"
          >
            {setupMessage} You can edit drafts to preview prices and profit.
            Saving remains disabled until setup is complete.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4 border-y border-white/10 px-6 py-4">
          <div
            className="flex gap-1 rounded-lg bg-white/5 p-1"
            role="group"
            aria-label="Model type"
          >
            {[
              { id: "all", label: "All" },
              { id: "video", label: "Video" },
              { id: "image", label: "Image" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={`rounded-md px-4 py-2 text-sm transition-colors ${tab === t.id ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="flex min-w-60 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3">
            <Search size={16} className="text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search models"
              placeholder="Search models"
              className="w-full bg-transparent py-2.5 text-sm outline-none"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-zinc-400">
          <span>
            {filtered.length} models. Prices convert at {money(creditUsd)} per
            credit.
          </span>
          <label className="flex items-center gap-2">
            Profit preview
            <select
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              className={`${field} bg-zinc-900 py-1.5 text-xs`}
            >
              <option value="nominal">Studio credit value</option>
              {PAID_PLANS.flatMap((p) => [
                <option key={`${p.id}:month`} value={`${p.id}:month`}>
                  {p.name}, monthly
                </option>,
                <option key={`${p.id}:year`} value={`${p.id}:year`}>
                  {p.name}, annual
                </option>,
              ])}
            </select>
          </label>
        </div>
        <div className="max-h-[48rem] overflow-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-y border-white/10 bg-[#191919] text-xs font-medium text-zinc-400">
              <tr>
                <th className="min-w-60 px-6 py-4">Model</th>
                <th className="min-w-52 px-4 py-4">Preview configuration</th>
                <th className="min-w-44 px-4 py-4">Provider cost</th>
                <th className="min-w-60 px-4 py-4">Your customer price</th>
                <th className="min-w-40 px-6 py-4">Gross profit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((model) => {
                const draft = drafts[model.id] ?? {
                  usd: "",
                  unit: "generation" as const,
                }
                const option = model.costs[selection[model.id] ?? 0]
                const secondText =
                  seconds[model.id] ??
                  (option?.seconds ? String(option.seconds) : "")
                const imageCount = Number(
                  images[model.id] ?? option?.images ?? 1
                )
                const previewSeconds =
                  secondText.trim() !== "" && Number(secondText) > 0
                    ? Number(secondText)
                    : null
                const validPrice =
                  draft.usd.trim() !== "" &&
                  Number.isFinite(Number(draft.usd)) &&
                  Number(draft.usd) > 0
                    ? Number(draft.usd)
                    : null
                const comparison = pricingComparison(
                  option,
                  validPrice,
                  draft.unit,
                  {
                    images:
                      Number.isInteger(imageCount) && imageCount > 0
                        ? imageCount
                        : 1,
                    seconds: previewSeconds,
                  },
                  revenuePerCredit / creditUsd,
                  creditUsd
                )
                return (
                  <tr
                    key={model.id}
                    className="border-b border-white/[0.06] align-top hover:bg-white/[0.015]"
                  >
                    <td className="px-6 py-5">
                      <div className="flex gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                          {model.previewImage ? (
                            <Image
                              src={model.previewImage}
                              alt=""
                              width={44}
                              height={44}
                              unoptimized
                              className="h-full w-full object-cover"
                            />
                          ) : model.surface === "video" ? (
                            <Film size={19} className="text-zinc-500" />
                          ) : (
                            <ImageIcon size={19} className="text-zinc-500" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{model.label}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {model.provider} / {model.surface}
                          </p>
                          <p className="mt-1 max-w-60 text-[11px] break-all text-zinc-600">
                            {model.id}
                          </p>
                          {legacy.includes(model.id) && (
                            <p className="mt-2 text-xs text-amber-300">
                              Legacy markup, needs manual review
                            </p>
                          )}
                          {model.legacy && (
                            <p className="mt-1 text-xs text-zinc-500">
                              Legacy model
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-5">
                      <div className="space-y-2">
                        {model.costs.length > 0 ? (
                          <select
                            aria-label={`${model.label} preview configuration`}
                            value={selection[model.id] ?? 0}
                            onChange={(e) =>
                              setSelection((s) => ({
                                ...s,
                                [model.id]: Number(e.target.value),
                              }))
                            }
                            className={`${field} w-full max-w-56 bg-zinc-900 text-xs`}
                          >
                            {model.costs.map((cost, index) => (
                              <option key={cost.id} value={index}>
                                {cost.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs text-zinc-500">
                            Configuration rates unavailable
                          </p>
                        )}
                        {model.surface === "video" ? (
                          <label className="flex items-center gap-2 text-xs text-zinc-400">
                            <input
                              aria-label={`${model.label} preview seconds`}
                              type="number"
                              min="0.1"
                              step="0.1"
                              placeholder="Duration"
                              value={secondText}
                              onChange={(e) =>
                                setSeconds((s) => ({
                                  ...s,
                                  [model.id]: e.target.value,
                                }))
                              }
                              className={`${field} w-24`}
                            />
                            seconds
                          </label>
                        ) : (
                          <label className="flex items-center gap-2 text-xs text-zinc-400">
                            <input
                              aria-label={`${model.label} preview image count`}
                              type="number"
                              min="1"
                              step="1"
                              value={
                                images[model.id] ??
                                (option?.images ? String(option.images) : "1")
                              }
                              onChange={(e) =>
                                setImages((s) => ({
                                  ...s,
                                  [model.id]: e.target.value,
                                }))
                              }
                              className={`${field} w-20`}
                            />
                            image(s)
                          </label>
                        )}
                        {model.id.startsWith("or:") && (
                          <button
                            type="button"
                            disabled={ratesLoading === model.id}
                            onClick={() => loadRates(model.id)}
                            className="text-xs text-zinc-300 underline decoration-zinc-600 underline-offset-4 disabled:opacity-40"
                          >
                            {ratesLoading === model.id
                              ? "Loading rates..."
                              : "Refresh provider rates"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-5">
                      {option?.rateUsd != null ? (
                        <>
                          <p className="tabular-nums">
                            {money(
                              option.unit === "token"
                                ? option.rateUsd * 1000000
                                : option.rateUsd
                            )}
                            <span className="ml-1 text-xs text-zinc-500">
                              /
                              {option.unit === "token"
                                ? "1M tokens"
                                : option.unit}
                            </span>
                          </p>
                          {comparison.providerUsd !== null && (
                            <p className="mt-2 text-xs text-zinc-400">
                              {money(comparison.providerUsd)} for this preview
                            </p>
                          )}
                          <p className="mt-2 max-w-52 text-xs leading-5 text-zinc-500">
                            {option.note}
                          </p>
                          {option.stale && (
                            <p className="mt-1 text-xs text-amber-300">
                              Saved provider data, refresh needed
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-zinc-500">
                          Unknown until the provider quotes or reports usage
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-5">
                      <div className="flex items-center gap-2">
                        <label
                          className={`${field} flex w-28 items-center gap-1 px-2`}
                        >
                          <span className="text-zinc-500">$</span>
                          <input
                            aria-label={`${model.label} customer price USD`}
                            type="number"
                            min={creditUsd}
                            step={creditUsd}
                            placeholder="Not set"
                            value={draft.usd}
                            onChange={(e) =>
                              setDraft(model.id, { usd: e.target.value })
                            }
                            disabled={busy}
                            className="w-full bg-transparent tabular-nums outline-none disabled:opacity-50"
                          />
                        </label>
                        <select
                          aria-label={`${model.label} customer rate unit`}
                          value={draft.unit}
                          disabled={busy}
                          onChange={(e) =>
                            setDraft(model.id, {
                              unit: e.target.value as SubscriptionRateUnit,
                            })
                          }
                          className={`${field} max-w-32 bg-zinc-900 text-xs`}
                        >
                          <option value="generation">per request</option>
                          {model.surface === "image" && (
                            <option value="image">per image</option>
                          )}
                          {model.surface === "video" && (
                            <option value="second">per second</option>
                          )}
                        </select>
                      </div>
                      {validPrice !== null ? (
                        <>
                          <p className="mt-2 text-xs text-zinc-400">
                            {Number((validPrice / creditUsd).toFixed(6))}{" "}
                            credits per{" "}
                            {draft.unit === "generation"
                              ? "request"
                              : draft.unit}
                          </p>
                          {comparison.customerUsd !== null && (
                            <p className="mt-1 text-xs text-zinc-500">
                              Customer quote: {money(comparison.customerUsd)}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-amber-200/80">
                          Set a price to enable subscriptions
                        </p>
                      )}
                      {draft.unit === "generation" && (
                        <p className="mt-2 max-w-56 text-xs text-zinc-500">
                          Flat charge includes every image and second in the
                          request.
                        </p>
                      )}
                      {draft.unit === "second" && (
                        <p className="mt-2 max-w-56 text-xs text-zinc-500">
                          Requires an explicit provider duration.
                          Source-following video needs a per-request price.
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      {comparison.profitUsd !== null ? (
                        <>
                          <p
                            className={`text-base font-medium tabular-nums ${comparison.profitUsd < 0 ? "text-red-300" : "text-zinc-100"}`}
                          >
                            {money(comparison.profitUsd)}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Estimated per preview request
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-zinc-400">Uncertain</p>
                          <p className="mt-1 max-w-40 text-xs leading-5 text-zinc-500">
                            {validPrice === null
                              ? "Set a customer price first."
                              : "Need a matching provider cost and duration."}
                          </p>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="p-6 text-sm text-zinc-400">
              {message || "No models match this search."}
            </p>
          )}
        </div>
        <div className="space-y-2 border-t border-white/10 px-6 py-4 text-xs leading-5 text-zinc-500">
          <p>
            Gross profit is a preview using the selected plan revenue per
            credit, before Stripe fees, refunds, and overhead. Provider
            discounts are not assumed. Published or saved rates are estimates,
            not an authenticated final quote.
          </p>
          <p>
            Choose a resolution and duration to compare the same configuration.
            A per-request price covers every quantity and duration; use
            per-image or per-second pricing when the charge should scale. Blank
            prices disable the model for subscription customers.
          </p>
          {message && (
            <p role="status" className="text-zinc-300">
              {message}
            </p>
          )}
        </div>
      </section>
      {reviews.length > 0 && (
        <section className="space-y-3 rounded-xl border border-amber-400/20 p-6">
          <h2 className="text-lg font-semibold">Billing reviews</h2>
          <p className="text-sm text-zinc-400">
            Refunded payments require an owner review. Credits have not been
            removed automatically.
          </p>
          {reviews.map((review) => (
            <div
              key={review.userId}
              className="rounded-lg bg-white/5 p-3 text-sm"
            >
              <p className="text-xs text-zinc-500">{review.userId}</p>
              <p className="mt-1">{review.review}</p>
            </div>
          ))}
        </section>
      )}
      <StripeSetupPlaceholder />
    </div>
  )
}
