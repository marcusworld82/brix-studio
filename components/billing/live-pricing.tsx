"use client"
import Link from "next/link"
import { useEffect, useState } from "react"
import { RefreshCw, ArrowUpRight } from "lucide-react"
import type { LiveCatalog } from "@/generation/catalog/live-types"
import { formatUsd } from "@/lib/billing/usd"
function display(amount: unknown) {
  const n = Number(amount)
  return Number.isFinite(n) && n >= 0 ? formatUsd(n) : "Not published"
}
export function LivePricing() {
  const [catalog, setCatalog] = useState<LiveCatalog | null>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [checkedAt, setCheckedAt] = useState(0)
  async function refresh() {
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !Array.isArray(data.models))
        throw new Error("Current prices are temporarily unavailable.")
      setCatalog(data)
      setCheckedAt(Date.now())
      setError("")
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not refresh prices."
      )
    }
  }
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0)
    const interval = setInterval(() => void refresh(), 60_000)
    return () => {
      clearTimeout(initial)
      clearInterval(interval)
    }
  }, [])
  const rows = (catalog?.models ?? []).filter(
    (m) =>
      (filter === "all" || m.surface === filter) &&
      `${m.label} ${m.family}`.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 md:px-8">
      <header className="flex flex-col gap-4">
        <p className="text-xs text-white/50">PERSONAL EDITION</p>
        <h1 className="font-display text-4xl md:text-5xl">
          Current models. Clear costs.
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-white/60">
          Prices and advertised deals refresh automatically. Your connected API
          key supplies the quote for your chosen inputs before each generation.
          Maximum discounts depend on account eligibility.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/image"
            className="btn-keycap rounded-xl px-5 py-3 text-sm"
          >
            Open your studio
          </Link>
          <a
            href="https://open.higgsfield.ai/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 text-sm text-white/60"
          >
            Provider pricing <ArrowUpRight className="size-4" />
          </a>
        </div>
      </header>
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/15">
        <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center">
          <input
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all models"
            aria-label="Search model prices"
          />
          <select
            className="rounded-lg border border-white/10 bg-page px-3 py-2 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Model type"
          >
            <option value="all">All models</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="audio">Audio</option>
          </select>
          <button
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-white/5"
            onClick={() => void refresh()}
          >
            <RefreshCw className="size-3.5" /> Refresh
          </button>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-b border-white/10 px-4 py-3 text-xs text-white/45">
          <span>{rows.length} model modes</span>
          <span>
            {catalog?.stale
              ? "Saved prices, refresh pending"
              : catalog
                ? `Checked ${new Date(catalog.fetchedAt).toLocaleString()}`
                : "Loading provider prices…"}
          </span>
        </div>
        {error ? (
          <p className="p-4 text-sm text-amber-200" role="status">
            {error}
          </p>
        ) : null}
        <div className="divide-y divide-white/10">
          {rows.map((model) => {
            const p = model.pricing?.primary
            const base = p?.original_amount ?? p?.amount
            const expired =
              typeof p?.discount_expires_at === "string" &&
              Date.parse(p.discount_expires_at) <= checkedAt
            const discount =
              !expired && Number(p?.discount_percentage) > 0
                ? Number(p?.discount_percentage)
                : 0
            return (
              <div
                key={model.id}
                className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_160px_160px] sm:items-center"
              >
                <div className="min-w-0">
                  <Link
                    className="block text-sm font-medium hover:text-lime"
                    href={`/${model.surface === "image" ? "image" : "video"}?liveModel=${encodeURIComponent(model.id)}`}
                  >
                    {model.label}
                  </Link>
                  <p className="mt-1 text-xs text-white/40">
                    {model.family} · {model.surface}
                  </p>
                </div>
                <div className="text-xs text-white/50">
                  List price
                  <p className="mt-1 font-mono text-sm text-white">
                    {p?.qualifier === "from" ? "From " : ""}
                    {p ? display(base) : "Quote in studio"}
                    {p ? ` / ${p.unit}` : ""}
                  </p>
                </div>
                <div className="text-xs text-white/50">
                  Published offer
                  <p className="mt-1 text-sm text-white">
                    {discount
                      ? `${display(p?.amount)} / ${p?.unit} · ${discount}% off`
                      : expired
                        ? "Offer expired"
                        : "No published offer"}
                  </p>
                  {p?.discount_expires_at && !expired ? (
                    <p className="mt-1 text-[11px] text-white/40">
                      Ends{" "}
                      {new Date(p.discount_expires_at).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
        {!rows.length && catalog ? (
          <p className="p-8 text-center text-sm text-white/50">
            No matching models.
          </p>
        ) : null}
      </section>
      <p className="text-xs leading-relaxed text-white/45">
        These are public starting rates, not guaranteed totals. Resolution,
        duration, references and account-specific discounts affect your cost. A
        label beginning “Est.” identifies a published formula estimate; the
        final provider charge can differ.
      </p>
    </div>
  )
}
