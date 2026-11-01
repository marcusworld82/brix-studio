"use client"
import { useEffect, useState } from "react"
import {
  getSubscriptionPricingAction,
  saveSubscriptionPricingAction,
} from "@/app/actions/subscription-admin"
type PriceModel = {
  id: string
  label: string
  provider: string
  surface: string
}
const inputClass =
  "w-28 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
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
  const [markup, setMarkup] = useState("30"),
    [credit, setCredit] = useState("0.01"),
    [models, setModels] = useState<PriceModel[]>([]),
    [markups, setMarkups] = useState<Record<string, string>>({}),
    [fixed, setFixed] = useState<Record<string, string>>({}),
    [reviews, setReviews] = useState<{ userId: string; review: string }[]>([]),
    [search, setSearch] = useState(""),
    [provider, setProvider] = useState("all"),
    [message, setMessage] = useState("Loading pricing..."),
    [busy, setBusy] = useState(true),
    [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let active = true
    getSubscriptionPricingAction()
      .then((r) => {
        if (!active) return
        if (r.ok) {
          setMarkup(String(r.data.markupPercent))
          setCredit(String(r.data.creditUsd))
          setModels(r.data.models)
          setReviews(r.data.billingReviews)
          setMarkups(
            Object.fromEntries(
              Object.entries(r.data.modelMarkups).map(([k, v]) => [
                k,
                String(v),
              ])
            )
          )
          setFixed(
            Object.fromEntries(
              Object.entries(r.data.fixedCredits).map(([k, v]) => [
                k,
                String(v),
              ])
            )
          )
          setMessage("")
          setLoaded(true)
        } else setMessage(r.error)
        setBusy(false)
      })
      .catch(() => {
        if (active) {
          setMessage("Pricing could not load. Refresh to try again.")
          setBusy(false)
        }
      })
    return () => {
      active = false
    }
  }, [])
  const existing = new Set(models.map((m) => m.id))
  const all = [
    ...models,
    ...Object.keys({ ...markups, ...fixed })
      .filter((id) => !existing.has(id))
      .map((id) => ({
        id,
        label: id,
        provider: id.startsWith("or:") ? "OpenRouter" : "Higgsfield",
        surface: "Saved model",
      })),
  ]
  const filtered = all.filter(
    (m) =>
      (provider === "all" || m.provider === provider) &&
      `${m.label} ${m.id}`.toLowerCase().includes(search.toLowerCase())
  )
  async function save() {
    setBusy(true)
    try {
      const numericMap = (values: Record<string, string>) =>
        Object.fromEntries(
          Object.entries(values)
            .filter(([, v]) => v.trim() !== "")
            .map(([k, v]) => [k, Number(v)])
        )
      const r = await saveSubscriptionPricingAction({
        markupPercent: Number(markup),
        creditUsd: Number(credit),
        modelMarkups: numericMap(markups),
        fixedCredits: numericMap(fixed),
      })
      setMessage(
        r.ok ? "Pricing saved. New generations will use these prices." : r.error
      )
    } catch {
      setMessage("Pricing could not save. Check the values and try again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-xl border border-white/10 p-6">
        <div>
          <h2 className="text-lg font-semibold">Model prices</h2>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Set a fixed credit price per generation for any model, or leave it
            blank to use the provider cost plus markup. Models without a
            provider quote need a fixed price. Blank markup uses the default. A
            fixed price covers the full request, including its requested image
            count.
          </p>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="space-x-3 text-sm">
            Default markup (%)
            <input
              type="number"
              min="0"
              max="10000"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="space-x-3 text-sm">
            Dollar value per credit
            <input
              type="number"
              min="0.000001"
              step="0.001"
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Search models"
            placeholder="Search model name or ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-64 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
          />
          <select
            aria-label="Filter provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm"
          >
            <option value="all">All providers</option>
            <option>Higgsfield</option>
            <option>OpenRouter</option>
          </select>
        </div>
        <p className="text-xs text-zinc-500">
          {filtered.length} of {all.length} models
        </p>
        <div className="max-h-[36rem] overflow-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-400">
              <tr>
                <th className="p-3">Model</th>
                <th className="p-3">Provider</th>
                <th className="p-3">Markup (%)</th>
                <th className="p-3">Fixed credits per generation</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-t border-white/5">
                  <td className="p-3">
                    <p>{m.label}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {m.id} · {m.surface}
                    </p>
                  </td>
                  <td className="p-3 text-zinc-400">{m.provider}</td>
                  <td className="p-3">
                    <input
                      aria-label={`${m.label} markup percent`}
                      type="number"
                      min="0"
                      max="10000"
                      placeholder={markup}
                      value={markups[m.id] ?? ""}
                      onChange={(e) =>
                        setMarkups((v) => ({ ...v, [m.id]: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      aria-label={`${m.label} fixed credit price`}
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Auto"
                      value={fixed[m.id] ?? ""}
                      onChange={(e) =>
                        setFixed((v) => ({ ...v, [m.id]: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loaded && !filtered.length && (
            <p className="p-4 text-sm text-zinc-400">
              No models match this search.
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button
            disabled={busy || !loaded}
            onClick={save}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
          >
            {busy ? "Saving..." : "Save prices"}
          </button>
          <p role="status" className="text-sm text-zinc-400">
            {message}
          </p>
        </div>
      </section>
      {reviews.length > 0 && (
        <section className="space-y-3 rounded-xl border border-amber-400/20 p-6">
          <h2 className="text-lg font-semibold">Billing reviews</h2>
          <p className="text-sm text-zinc-400">
            Refunded payments require an owner review. Credits have not been
            removed automatically.
          </p>
          {reviews.map((r) => (
            <div key={r.userId} className="rounded-lg bg-white/5 p-3 text-sm">
              <p className="font-mono text-xs text-zinc-400">{r.userId}</p>
              <p className="mt-1">{r.review}</p>
            </div>
          ))}
        </section>
      )}
      <StripeSetupPlaceholder />
    </div>
  )
}
