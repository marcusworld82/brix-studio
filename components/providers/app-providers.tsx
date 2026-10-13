"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import type { ClientPricing } from "@/lib/billing/pricing"

import { Toaster, useToast } from "./toaster"

/* ── Session ───────────────────────────────────────────────────────────── */

export type ClientUser = {
  apiKeyConnected?: boolean
  id: string
  role: "user" | "admin"
  email: string
  name?: string | null
  image?: string | null
}

type AppContextValue = {
  user: ClientUser | null
  credits: number | null
  refreshCredits: () => void
  pricing: ClientPricing
  /** Opens the auth modal; `resume` is appended to the return URL. */
  openAuth: (options?: {
    mode?: "login" | "signup"
    resume?: string
    reason?: string
  }) => void
  closeAuth: () => void
  auth: {
    open: boolean
    mode: "login" | "signup"
    callbackUrl: string
    reason?: string
  }
  openUpgrade: (reason?: string) => void
  closeUpgrade: () => void
  upgrade: { open: boolean; reason?: string }
}

const AppContext = createContext<AppContextValue | null>(null)

export const BALANCE_EVENT = "vireo:balance"

/** Ask every credit pill to refetch (after a submit, refund or purchase). */
export function announceBalanceChange(): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(BALANCE_EVENT))
}

export function AppProviders({
  user,
  initialCredits,
  pricing,
  children,
}: {
  user: ClientUser | null
  initialCredits: number | null
  pricing: ClientPricing
  children: ReactNode
}) {
  const [credits, setCredits] = useState<number | null>(initialCredits)
  const [auth, setAuth] = useState<AppContextValue["auth"]>({
    open: false,
    mode: "signup",
    callbackUrl: "/",
  })
  const [upgrade, setUpgrade] = useState<AppContextValue["upgrade"]>({
    open: false,
  })
  const inflight = useRef(false)

  const refreshCredits = useCallback(() => {
    if (!user || inflight.current) return
    inflight.current = true
    void fetch("/api/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ total?: number }>)
      .then((data) => {
        if (typeof data.total === "number") setCredits(data.total)
      })
      .catch(() => undefined)
      .finally(() => {
        inflight.current = false
      })
  }, [user])

  useEffect(() => {
    const handler = () => refreshCredits()
    window.addEventListener(BALANCE_EVENT, handler)
    window.addEventListener("focus", handler)
    return () => {
      window.removeEventListener(BALANCE_EVENT, handler)
      window.removeEventListener("focus", handler)
    }
  }, [refreshCredits])

  const openAuth = useCallback<AppContextValue["openAuth"]>((options) => {
    const url = new URL(window.location.href)
    if (options?.resume) url.searchParams.set("resume", options.resume)
    setAuth({
      open: true,
      mode: options?.mode ?? "signup",
      callbackUrl: `${url.pathname}${url.search}`,
      ...(options?.reason ? { reason: options.reason } : {}),
    })
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      credits,
      refreshCredits,
      pricing,
      openAuth,
      closeAuth: () => setAuth((current) => ({ ...current, open: false })),
      auth,
      openUpgrade: (reason) =>
        setUpgrade({ open: true, ...(reason ? { reason } : {}) }),
      closeUpgrade: () => setUpgrade({ open: false }),
      upgrade,
    }),
    [auth, credits, openAuth, pricing, refreshCredits, upgrade, user]
  )

  return (
    <AppContext.Provider value={value}>
      {children}
      <Toaster />
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error("useApp must be used inside <AppProviders>")
  return value
}

/**
 * Gate an action on sign-in: returns true when signed in; otherwise opens the
 * auth modal (keeping the dock state, which lives in localStorage) and
 * returns false. `resume` is replayed after the magic link brings them back.
 */
export function useRequireAuth() {
  const { user, openAuth } = useApp()
  return useCallback(
    (resume?: string, reason?: string) => {
      if (user) return true
      openAuth({
        mode: "signup",
        ...(resume ? { resume } : {}),
        ...(reason ? { reason } : {}),
      })
      return false
    },
    [openAuth, user]
  )
}

export { useToast }
