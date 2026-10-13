"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useApp } from "@/components/providers/app-providers"
import { useEffect, useState } from "react"

import { useLocalFlag } from "@/lib/studio/local-flag"

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

/**
 * EU cookie consent. Only essential cookies (session, CSRF) are set by default;
 * nothing analytics-related loads until "analytics" consent is stored. Other
 * code reads `hasConsent("analytics")` before loading any tracker.
 */
export type ConsentState = {
  essential: true
  analytics: boolean
  marketing: boolean
  at: number
}
const KEY = "vireo.consent.v1"

export function readConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ConsentState) : null
  } catch {
    return null
  }
}

export function hasConsent(kind: "analytics" | "marketing"): boolean {
  return readConsent()?.[kind] === true
}

export function CookieConsent() {
  const { auth } = useApp()
  const pathname = usePathname()
  const authPage = pathname === "/login" || pathname.startsWith("/login/")
  const [stored, setStored, hydrated] = useLocalFlag(KEY)
  const [preferences, setPreferences] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const visible = hydrated && stored === null

  useEffect(() => {
    const reopen = () => setPreferences(true)
    window.addEventListener("vireo:cookie-preferences", reopen)
    return () => window.removeEventListener("vireo:cookie-preferences", reopen)
  }, [])

  const decide = (next: { analytics: boolean; marketing: boolean }) => {
    setStored(JSON.stringify({ essential: true, ...next, at: Date.now() }))
    window.dispatchEvent(new Event("vireo:consent"))
    setPreferences(false)
  }

  return (
    <>
      {visible && !preferences && !auth.open && !authPage ? (
        <div
          role="dialog"
          aria-label="Cookie notice"
          className="fixed right-4 bottom-4 left-4 z-[60] flex max-w-sm flex-col gap-3 rounded-2xl border border-white/5 bg-surface p-5 shadow-2xl sm:left-auto"
        >
          <p className="text-lg font-semibold">Cookie notice</p>
          <p className="text-sm text-muted-foreground">
            We use essential cookies to keep you signed in. With your permission
            we&apos;d also use analytics cookies to improve the studio. See our{" "}
            <Link
              href="/legal/privacy"
              className="text-foreground underline underline-offset-2"
            >
              privacy policy
            </Link>
            .
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn-keycap h-10 rounded-[10px] text-sm font-semibold"
              onClick={() => decide({ analytics: true, marketing: true })}
            >
              Accept all cookies
            </button>
            <button
              type="button"
              className="h-10 rounded-[10px] bg-white/10 text-sm font-medium hover:bg-white/15"
              onClick={() => decide({ analytics: false, marketing: false })}
            >
              Reject non-essential cookies
            </button>
            <button
              type="button"
              className="h-10 rounded-[10px] border border-white/10 text-sm font-medium hover:bg-white/5"
              onClick={() => setPreferences(true)}
            >
              Cookie preferences
            </button>
          </div>
        </div>
      ) : null}
      <Dialog open={preferences && !auth.open} onOpenChange={setPreferences}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Cookie preferences</DialogTitle>
            <DialogDescription>
              Choose which optional cookies we may use.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              <Toggle
                label="Essential"
                hint="Sign-in and security. Always on."
                checked
                disabled
              />
              <Toggle
                label="Analytics"
                hint="Anonymous usage to improve the product."
                checked={analytics}
                onChange={setAnalytics}
              />
              <Toggle
                label="Marketing"
                hint="Measure our campaigns."
                checked={marketing}
                onChange={setMarketing}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => decide({ analytics: false, marketing: false })}
            >
              Reject all
            </Button>
            <Button onClick={() => decide({ analytics, marketing })}>
              Save choices
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange?: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60 ${checked ? "bg-lime" : "bg-[#3a3d42]"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : ""}`}
        />
      </button>
    </div>
  )
}
