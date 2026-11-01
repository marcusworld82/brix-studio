"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import {
  ArrowDownToLine,
  ArrowRight,
  CreditCard,
  Film,
  History,
  ImageIcon,
  Layers3,
  LogOut,
  Settings2,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from "lucide-react"
import {
  defaultDemoState,
  demoUsage,
  parseDemoState,
  quoteDemo,
  restoreDemoState,
  simulatePreview,
  STORAGE_KEY,
  type DemoState,
  type DemoPlan,
} from "@/lib/subscription/demo"
import s from "./subscription.module.css"

type View = "studio" | "plans" | "history" | "account" | "admin"
const nav = [
  { id: "studio", label: "Studio", icon: Layers3 },
  { id: "history", label: "History", icon: History },
  { id: "plans", label: "Plans & billing", icon: CreditCard },
  { id: "account", label: "Account", icon: User },
  { id: "admin", label: "Admin demo", icon: Settings2 },
] as const
const usd = (amount: number) =>
  `$${amount.toFixed(amount > 0 && amount < 0.01 ? 4 : 2)}`
const count = (amount: number) => amount.toLocaleString("en-US")

export function SubscriptionDemo() {
  const [state, setState] = useState<DemoState>(defaultDemoState)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>("studio")
  const [kind, setKind] = useState<"image" | "video">("image")
  const [modelId, setModelId] = useState("image-fast")
  const [prompt, setPrompt] = useState(
    "A sculptural glass bottle on a weathered stone plinth, soft coastal light, editorial product photography."
  )
  const [aspect, setAspect] = useState("16:9")
  const [quantity, setQuantity] = useState(1)
  const [duration, setDuration] = useState(5)
  const [message, setMessage] = useState("")
  const [panel, setPanel] = useState<
    DemoPlan | "billing" | "auth" | "reset" | null
  >(null)
  const [draft, setDraft] = useState<DemoState | null>(null)
  const [displayName, setDisplayName] = useState("Demo creator")
  const [lastPreview, setLastPreview] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setState(restoreDemoState(localStorage.getItem(STORAGE_KEY)))
      } catch {
        setMessage("Browser storage is unavailable. Changes stay in this tab.")
      }
      setReady(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      queueMicrotask(() =>
        setMessage(
          "Changes could not be saved in this browser. This tab still works."
        )
      )
    }
  }, [ready, state])
  useEffect(() => {
    const dialog = dialogRef.current
    if (panel && dialog && !dialog.open) dialog.showModal()
    if (!panel && dialog?.open) dialog.close()
  }, [panel])

  const model =
    state.models.find((item) => item.id === modelId) ??
    state.models.find((item) => item.kind === kind)!
  const units = quantity * (kind === "video" ? duration : 1)
  const quote = quoteDemo(model, state.creditsPerUsd, units)
  const usage = demoUsage(state)
  const plan = state.plans.find((item) => item.id === state.selectedPlanId)!
  const admin = draft ?? state
  const modelNames = state.models.filter((item) => item.kind === kind)

  function navigate(next: View) {
    setView(next)
    setMessage("")
    if (next === "admin") setDraft(structuredClone(state))
    if (next === "account") setDisplayName(state.displayName)
  }
  function selectKind(next: "image" | "video") {
    setKind(next)
    setModelId(state.models.find((item) => item.kind === next)!.id)
    setLastPreview(false)
  }
  function simulate() {
    try {
      setState(
        simulatePreview(
          state,
          { modelId: model.id, prompt, units },
          crypto.randomUUID(),
          new Date().toISOString()
        )
      )
      setLastPreview(true)
      setMessage(
        `${quote.credits} demo credits used. Saved to local history. No media was generated.`
      )
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Preview could not be saved."
      )
    }
  }
  function saveAdmin() {
    const validated = parseDemoState({
      ...admin,
      history: state.history,
      displayName: state.displayName,
      signedIn: state.signedIn,
      selectedPlanId: state.selectedPlanId,
    })
    if (!validated) {
      setMessage(
        "Check the settings. Rates must be positive, markups 0 to 1,000%, and plan credits whole numbers from 1 to 10,000,000."
      )
      return
    }
    setState(validated)
    setDraft(validated)
    setMessage("Draft pricing saved in this browser. No live prices changed.")
  }
  function downloadHistory() {
    const blob = new Blob(
      [JSON.stringify({ demo: true, history: state.history }, null, 2)],
      { type: "application/json" }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "brix-demo-history.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <a
          className={s.brand}
          href="/subscription"
          aria-label="BRIX subscription demo"
        >
          <span className={s.brandMark} aria-hidden="true">
            ▰
          </span>{" "}
          BRIX<span className={s.brandSub}>STUDIO</span>
        </a>
        <div className={s.workspace}>
          <span>Workspace</span>
          <strong>Subscription preview</strong>
          <small>Local demo · no backend</small>
        </div>
        <nav aria-label="Subscription workspace" className={s.nav}>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className={s.sideFoot}>
          <ShieldCheck size={18} />
          <p>
            Your browser, your demo.
            <br />
            <span>No connected services.</span>
          </p>
        </div>
      </aside>
      <div className={s.body}>
        <header className={s.topbar}>
          <div>
            <span className={s.demoBadge}>Demo</span>
            <span className={s.topLabel}>Monthly credit studio</span>
          </div>
          <button className={s.creditButton} onClick={() => navigate("plans")}>
            {count(usage.remaining)} <span>demo credits</span>
            <ArrowRight size={14} />
          </button>
        </header>
        <main className={s.main}>
          <div className={s.titleRow}>
            <div>
              <h1>
                {view === "studio"
                  ? "Create something distinct."
                  : view === "plans"
                    ? "Plans & billing"
                    : view === "history"
                      ? "Your demo history"
                      : view === "account"
                        ? "Account"
                        : "Pricing controls"}
              </h1>
              <p>
                {view === "studio"
                  ? "Shape the idea. See the draft cost. Preview the credit flow."
                  : view === "admin"
                    ? "Owner controls for a future subscription service. All values are draft."
                    : "Subscription demo. Changes are saved only in this browser."}
              </p>
            </div>
            <span className={s.status}>Frontend preview</span>
          </div>
          {message && (
            <div className={s.notice} role="status">
              {message}
              <button
                onClick={() => setMessage("")}
                aria-label="Dismiss message"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!ready ? (
            <p role="status">Loading local demo…</p>
          ) : (
            <>
              {view === "studio" && (
                <>
                  <div className={s.studioGrid}>
                    <section
                      className={s.composer}
                      aria-label="Demo generation settings"
                    >
                      <div className={s.tabs} aria-label="Media type">
                        {(["image", "video"] as const).map((type) => (
                          <button
                            key={type}
                            onClick={() => selectKind(type)}
                            aria-pressed={kind === type}
                          >
                            {type === "image" ? (
                              <ImageIcon size={16} />
                            ) : (
                              <Film size={16} />
                            )}
                            {type === "image" ? "Image" : "Video"}
                          </button>
                        ))}
                      </div>
                      <label className={s.field}>
                        Demo model
                        <select
                          value={model.id}
                          onChange={(event) => setModelId(event.target.value)}
                        >
                          {modelNames.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <small>
                          Illustrative model presets, not a live provider
                          catalog.
                        </small>
                      </label>
                      <label className={s.field}>
                        Your prompt
                        <textarea
                          value={prompt}
                          onChange={(event) => setPrompt(event.target.value)}
                          maxLength={2000}
                          rows={4}
                          placeholder="Describe what you want to create…"
                        />
                        <span className={s.characterCount}>
                          {prompt.length} / 2,000
                        </span>
                      </label>
                      <div className={s.settingGrid}>
                        <label className={s.field}>
                          Aspect ratio
                          <select
                            value={aspect}
                            onChange={(event) => setAspect(event.target.value)}
                          >
                            <option>16:9</option>
                            <option>9:16</option>
                            <option>1:1</option>
                          </select>
                        </label>
                        <label className={s.field}>
                          Outputs
                          <select
                            value={quantity}
                            onChange={(event) =>
                              setQuantity(Number(event.target.value))
                            }
                          >
                            {[1, 2, 4].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {kind === "video" && (
                        <label className={s.field}>
                          Duration
                          <select
                            value={duration}
                            onChange={(event) =>
                              setDuration(Number(event.target.value))
                            }
                          >
                            <option value={5}>5 seconds</option>
                            <option value={10}>10 seconds</option>
                          </select>
                        </label>
                      )}
                      <div className={s.quote}>
                        <div>
                          <span>Draft credit estimate</span>
                          <strong>
                            {count(quote.credits)} <small>credits</small>
                          </strong>
                        </div>
                        <div>
                          <span>Draft equivalent</span>
                          <strong>{usd(quote.draftUsd)}</strong>
                        </div>
                      </div>
                      <button
                        className={s.primary}
                        onClick={simulate}
                        disabled={
                          !prompt.trim() ||
                          !state.signedIn ||
                          quote.credits > usage.remaining
                        }
                      >
                        <Sparkles size={17} />
                        Simulate credit preview
                        <ArrowRight size={17} />
                      </button>
                      {!state.signedIn && (
                        <button
                          className={s.linkButton}
                          onClick={() => setPanel("auth")}
                        >
                          Enter the demo account to preview
                        </button>
                      )}
                      <p className={s.fine}>
                        No paid generation. This only updates your demo balance
                        and history. Aspect ratio changes the reference frame,
                        not this draft cost.
                      </p>
                    </section>
                    <section
                      className={s.canvas}
                      aria-label="Reference preview"
                    >
                      <div className={s.canvasBar}>
                        <span>Reference canvas</span>
                        <span>
                          {aspect} · {kind}
                        </span>
                      </div>
                      <div className={s.canvasStage}>
                        <div
                          className={s.reference}
                          style={{
                            aspectRatio: aspect.replace(":", "/"),
                            maxWidth: aspect === "9:16" ? 250 : undefined,
                          }}
                        >
                          <Image
                            src="/media/loops/floating-product.jpg"
                            alt="Existing BRIX product photography reference, not generated by this demo"
                            fill
                            sizes="(max-width: 768px) 80vw, 50vw"
                            style={{ objectFit: "cover" }}
                            priority
                          />
                          <span className={s.referenceTag}>
                            Existing reference
                          </span>
                        </div>
                      </div>
                      <div className={s.canvasCaption}>
                        <div>
                          <strong>
                            {lastPreview
                              ? "Credit flow previewed."
                              : "A place for your next idea."}
                          </strong>
                          <p>
                            {lastPreview
                              ? "Your local history now holds the prompt and draft cost. The reference stays the same."
                              : "Preview pricing before a future generation. This image is an existing BRIX asset."}
                          </p>
                        </div>
                        <span className={s.canvasIcon}>
                          <ImageIcon size={22} />
                        </span>
                      </div>
                    </section>
                  </div>
                  <div className={s.bottomStrip}>
                    <div>
                      <span>Demo monthly allocation</span>
                      <strong>
                        {count(usage.remaining)}{" "}
                        <small>of {count(usage.allocation)} credits left</small>
                      </strong>
                      <progress
                        value={Math.min(usage.used, usage.allocation)}
                        max={usage.allocation}
                        aria-label="Demo credits used"
                      />
                    </div>
                    <div>
                      <span>Draft plan</span>
                      <strong>{plan.name}</strong>
                      <button
                        className={s.linkButton}
                        onClick={() => navigate("plans")}
                      >
                        Explore plans <ArrowRight size={14} />
                      </button>
                    </div>
                    <div>
                      <span>Local previews</span>
                      <strong>{state.history.length}</strong>
                      <button
                        className={s.linkButton}
                        onClick={() => navigate("history")}
                      >
                        View history <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </>
              )}
              {view === "plans" && (
                <>
                  <div className={s.sectionNote}>
                    Illustrative prices and monthly allocations. These are draft
                    scenarios, not approved sales offers. No active subscription
                    or renewal date exists.
                  </div>
                  <div className={s.planGrid}>
                    {state.plans.map((item) => (
                      <section className={s.plan} key={item.id}>
                        <div className={s.planTitle}>
                          <h2>{item.name}</h2>
                          {item.id === state.selectedPlanId && (
                            <span>Demo selection</span>
                          )}
                        </div>
                        <p className={s.planPrice}>
                          {usd(item.monthlyUsd)}
                          <small> / month, draft</small>
                        </p>
                        <strong>
                          {count(item.monthlyCredits)} demo credits
                        </strong>
                        <p>
                          Monthly allocation preview
                          <br />
                          Shared image and video balance
                          <br />
                          Personal usage history
                        </p>
                        <button
                          className={s.secondary}
                          onClick={() => setPanel(item)}
                        >
                          Explore {item.name}
                          <ArrowRight size={16} />
                        </button>
                      </section>
                    ))}
                  </div>
                  <section className={s.panel}>
                    <h2>Billing connection</h2>
                    <div className={s.detailRow}>
                      <div>
                        <strong>No payment method connected</strong>
                        <p>
                          Checkout, invoices, renewals and cancellation need a
                          payment provider.
                        </p>
                      </div>
                      <button
                        className={s.secondary}
                        onClick={() => setPanel("billing")}
                      >
                        Billing details
                      </button>
                    </div>
                  </section>
                </>
              )}
              {view === "history" && (
                <>
                  <div className={s.historySummary}>
                    <div>
                      <span>Demo credits used</span>
                      <strong>{count(usage.used)}</strong>
                    </div>
                    <div>
                      <span>Saved local previews</span>
                      <strong>{state.history.length}</strong>
                    </div>
                    <button
                      className={s.secondary}
                      disabled={!state.history.length}
                      onClick={downloadHistory}
                    >
                      <ArrowDownToLine size={16} />
                      Export JSON
                    </button>
                  </div>
                  <section className={s.panel}>
                    <h2>Credit previews</h2>
                    <p className={s.fine}>
                      Prompt and cost records only. No generated media, real
                      credit charges or provider jobs.
                    </p>
                    {state.history.length ? (
                      <div className={s.historyList}>
                        {state.history.map((entry) => (
                          <article className={s.historyRow} key={entry.id}>
                            <div>
                              <strong>{entry.modelName}</strong>
                              <p>{entry.prompt}</p>
                              <small>
                                {new Date(entry.createdAt).toLocaleString()} ·
                                Local simulation
                              </small>
                            </div>
                            <div className={s.historyCost}>
                              <strong>{count(entry.credits)} credits</strong>
                              <small>{usd(entry.usd)} draft</small>
                              <button
                                className={s.linkButton}
                                onClick={() => {
                                  setPrompt(entry.prompt)
                                  selectKind(entry.kind)
                                  const original = state.models.find(
                                    (item) => item.name === entry.modelName
                                  )
                                  if (original) setModelId(original.id)
                                  navigate("studio")
                                }}
                              >
                                Reuse prompt
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className={s.empty}>
                        <History size={26} />
                        <h3>Your ideas start here.</h3>
                        <p>
                          Simulate a credit preview in the studio to see your
                          first local record.
                        </p>
                        <button
                          className={s.secondary}
                          onClick={() => navigate("studio")}
                        >
                          Open studio <ArrowRight size={16} />
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}
              {view === "account" && (
                <div className={s.accountGrid}>
                  <section className={s.panel}>
                    <h2>Demo profile</h2>
                    <p>
                      This is a local profile. No email, password or personal
                      account is created.
                    </p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (!displayName.trim()) return
                        setState({ ...state, displayName: displayName.trim() })
                        setMessage("Demo display name saved in this browser.")
                      }}
                    >
                      <label className={s.field}>
                        Display name
                        <input
                          required
                          maxLength={60}
                          value={displayName}
                          onChange={(event) =>
                            setDisplayName(event.target.value)
                          }
                          autoComplete="off"
                        />
                      </label>
                      <button className={s.secondary}>Save demo profile</button>
                    </form>
                  </section>
                  <section className={s.panel}>
                    <h2>Session & storage</h2>
                    <div className={s.detailRow}>
                      <span>
                        {state.signedIn
                          ? `Demo session: ${state.displayName}`
                          : "Demo session ended"}
                      </span>
                      <button
                        className={s.secondary}
                        onClick={() => {
                          if (state.signedIn) {
                            setState({ ...state, signedIn: false })
                            setMessage(
                              "Demo session ended. Real authentication is not connected."
                            )
                          } else setPanel("auth")
                        }}
                      >
                        <LogOut size={16} />
                        {state.signedIn ? "Leave demo" : "Enter demo"}
                      </button>
                    </div>
                    <p>
                      Session buttons simulate sign in and sign out. Supabase
                      Auth is not connected to this edition.
                    </p>
                    <button
                      className={s.linkButton}
                      onClick={() => setPanel("reset")}
                    >
                      Reset all local demo data
                    </button>
                  </section>
                </div>
              )}
              {view === "admin" && (
                <>
                  <div className={s.sectionNote}>
                    Local owner sandbox, not a protected admin account.
                    Production settings require server authorization. Markup is
                    a percentage of provider cost, not a profit margin.
                  </div>
                  <section className={s.panel}>
                    <h2>Credit conversion</h2>
                    <label className={`${s.field} ${s.shortField}`}>
                      Credits per draft USD
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        step={1}
                        value={admin.creditsPerUsd}
                        onChange={(event) =>
                          setDraft({
                            ...admin,
                            creditsPerUsd: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <p className={s.fine}>
                      Credits = round up(base cost × units × (1 + markup / 100)
                      × credits per USD).
                    </p>
                  </section>
                  <section className={s.panel}>
                    <h2>Per-model draft prices</h2>
                    <div className={s.adminRows}>
                      {admin.models.map((item, index) => (
                        <div className={s.adminModel} key={item.id}>
                          <div>
                            <strong>{item.name}</strong>
                            <small>
                              {item.kind === "video"
                                ? "Draft base per second"
                                : "Draft base per image"}
                            </small>
                          </div>
                          <label className={s.field}>
                            Base cost, USD
                            <input
                              type="number"
                              min={0.001}
                              max={1000}
                              step={0.001}
                              value={item.baseUsd}
                              onChange={(event) =>
                                setDraft({
                                  ...admin,
                                  models: admin.models.map((m, i) =>
                                    i === index
                                      ? {
                                          ...m,
                                          baseUsd: Number(event.target.value),
                                        }
                                      : m
                                  ),
                                })
                              }
                            />
                          </label>
                          <label className={s.field}>
                            Markup, %
                            <input
                              type="number"
                              min={0}
                              max={1000}
                              value={item.markupPercent}
                              onChange={(event) =>
                                setDraft({
                                  ...admin,
                                  models: admin.models.map((m, i) =>
                                    i === index
                                      ? {
                                          ...m,
                                          markupPercent: Number(
                                            event.target.value
                                          ),
                                        }
                                      : m
                                  ),
                                })
                              }
                            />
                          </label>
                          <div className={s.adminPreview}>
                            <span>1 unit, draft</span>
                            <strong>
                              {(() => {
                                try {
                                  return `${quoteDemo(item, admin.creditsPerUsd, 1).credits} credits`
                                } catch {
                                  return "Check values"
                                }
                              })()}
                            </strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className={s.panel}>
                    <h2>Monthly plan allocations</h2>
                    {admin.plans.map((item, index) => (
                      <div className={s.adminPlan} key={item.id}>
                        <label className={s.field}>
                          Plan name
                          <input
                            value={item.name}
                            maxLength={60}
                            onChange={(event) =>
                              setDraft({
                                ...admin,
                                plans: admin.plans.map((p, i) =>
                                  i === index
                                    ? { ...p, name: event.target.value }
                                    : p
                                ),
                              })
                            }
                          />
                        </label>
                        <label className={s.field}>
                          Monthly draft USD
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            step={0.01}
                            value={item.monthlyUsd}
                            onChange={(event) =>
                              setDraft({
                                ...admin,
                                plans: admin.plans.map((p, i) =>
                                  i === index
                                    ? {
                                        ...p,
                                        monthlyUsd: Number(event.target.value),
                                      }
                                    : p
                                ),
                              })
                            }
                          />
                        </label>
                        <label className={s.field}>
                          Monthly demo credits
                          <input
                            type="number"
                            min={1}
                            max={10000000}
                            step={1}
                            value={item.monthlyCredits}
                            onChange={(event) =>
                              setDraft({
                                ...admin,
                                plans: admin.plans.map((p, i) =>
                                  i === index
                                    ? {
                                        ...p,
                                        monthlyCredits: Number(
                                          event.target.value
                                        ),
                                      }
                                    : p
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </section>
                  <div className={s.saveRow}>
                    <button className={s.primary} onClick={saveAdmin}>
                      Save draft settings
                    </button>
                    <button
                      className={s.secondary}
                      onClick={() => {
                        setDraft(structuredClone(state))
                        setMessage("Unsaved draft edits discarded.")
                      }}
                    >
                      Discard edits
                    </button>
                    <button
                      className={s.linkButton}
                      onClick={() => setPanel("reset")}
                    >
                      Reset demo
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          <footer className={s.footer}>
            BRIX subscription edition{" "}
            <span>
              Frontend only. No live accounts, payments or generation.
            </span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialogRef}
        className={s.dialog}
        onCancel={() => setPanel(null)}
        onClose={() => setPanel(null)}
        aria-labelledby="subscription-dialog-title"
      >
        <button
          className={s.dialogClose}
          onClick={() => setPanel(null)}
          aria-label="Close panel"
        >
          <X size={20} />
        </button>
        <span className={s.dialogEyebrow}>BRIX demo</span>
        <h2 id="subscription-dialog-title">
          {panel === "reset"
            ? "Reset this browser demo?"
            : panel === "auth"
              ? "Enter a local demo session"
              : "Billing is not connected"}
        </h2>
        <p>
          {panel === "reset"
            ? "This removes your local profile edits, pricing settings and preview history. It restores the original demo allocation."
            : panel === "auth"
              ? "No account will be created and no email will be sent. This only enables the preview controls in this browser."
              : "There is no checkout, payment method or subscription behind this screen. All displayed amounts are draft examples."}
        </p>
        {panel && typeof panel === "object" && (
          <>
            <div className={s.dialogPlan}>
              <strong>{panel.name}</strong>
              <span>{usd(panel.monthlyUsd)} / month, draft</span>
              <span>{count(panel.monthlyCredits)} demo credits</span>
            </div>
            <p className={s.fine}>
              Selecting a demo plan changes the local allowance. Existing
              preview usage stays deducted. No purchase or renewal occurs.
            </p>
            <button
              className={s.primary}
              onClick={() => {
                setState({ ...state, selectedPlanId: panel.id })
                setPanel(null)
                setMessage(
                  `${panel.name} selected for this local demo. No subscription started.`
                )
              }}
            >
              Use this demo plan
            </button>
          </>
        )}
        {panel === "auth" && (
          <button
            className={s.primary}
            onClick={() => {
              setState({ ...state, signedIn: true })
              setPanel(null)
              setMessage("Local demo session started.")
            }}
          >
            Enter demo
          </button>
        )}
        {panel === "reset" && (
          <button
            className={s.primary}
            onClick={() => {
              const initial = defaultDemoState()
              setState(initial)
              setDraft(structuredClone(initial))
              setDisplayName(initial.displayName)
              setModelId("image-fast")
              setKind("image")
              setLastPreview(false)
              setPanel(null)
              setMessage("Local demo reset.")
            }}
          >
            Reset local demo
          </button>
        )}
        <button className={s.secondary} onClick={() => setPanel(null)}>
          {panel === "reset" ? "Keep my demo data" : "Close"}
        </button>
      </dialog>
    </div>
  )
}
