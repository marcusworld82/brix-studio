"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { ArrowLeft, Loader2, MailCheck } from "lucide-react"

import { requestMagicLinkAction } from "@/app/actions/auth"
import { PasswordLoginForm } from "./password-login-form"
import { useApp } from "@/components/providers/app-providers"
import { BRAND } from "@/lib/brand"

import { LogoMark } from "../site/logo"

/** Magic-link sign-in: one email field, then "check your email". */
function MagicLinkForm({
  mode = "signup",
  callbackUrl = "/",
  reason,
  onModeChange,
}: {
  mode?: "login" | "signup"
  callbackUrl?: string
  reason?: string
  onModeChange?: (mode: "login" | "signup") => void
}) {
  const [email, setEmail] = useState("")
  const [consent, setConsent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    if (mode === "signup" && !consent) {
      setError("Please accept the Terms and Privacy Policy to continue.")
      return
    }
    setPending(true)
    setError(null)
    const result = await requestMagicLinkAction({ email, callbackUrl })
    setPending(false)
    if (result.ok) setSentTo(result.data.email)
    else setError(result.error)
  }

  if (sentTo)
    return (
      <div className="flex flex-col items-start gap-4" aria-live="polite">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-lime/10 text-lime">
          <MailCheck className="size-6" />
        </span>
        <h2 className="text-3xl font-semibold tracking-tight">
          Check your email
        </h2>
        <p className="text-sm text-muted-foreground">
          We sent a sign-in link to{" "}
          <span className="text-foreground">{sentTo}</span>. It expires in an
          hour. You can close this window — the link brings you right back.
        </p>
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            setSentTo(null)
            setEmail("")
          }}
        >
          <ArrowLeft className="size-4" /> Use a different email
        </button>
      </div>
    )

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-5" noValidate>
      <LogoMark className="size-8" />
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[30px] leading-tight font-semibold tracking-tight">
          {mode === "signup" ? `Welcome to ${BRAND.name}` : "Welcome back"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {reason ??
            (mode === "signup"
              ? "Sign up with your email — no password needed."
              : "Sign in with a magic link sent to your email.")}
        </p>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="h-12 rounded-xl border border-white/10 bg-surface px-4 text-base text-foreground placeholder:text-muted-foreground focus:border-lime/60 focus:outline-none"
        />
      </label>
      {mode === "signup" ? (
        <label className="flex items-start gap-3 text-sm text-muted-foreground">
          <input
            type="checkbox"
            aria-label="I agree to the Terms of Service and Privacy Policy"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[#0582ca]"
          />
          <span>
            I agree to the{" "}
            <Link
              href="/legal/terms"
              className="text-foreground underline underline-offset-2"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/legal/privacy"
              className="text-foreground underline underline-offset-2"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[#ff6b6b]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || !email}
        className="btn-keycap flex h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Sending link…" : "Continue with email"}
      </button>
      {onModeChange ? (
        <p className="text-center text-sm text-muted-foreground">
          {mode === "signup" ? "Already have an account? " : "New here? "}
          <button
            type="button"
            className="font-medium text-lime hover:underline"
            onClick={() => {
              setError(null)
              onModeChange(mode === "signup" ? "login" : "signup")
            }}
          >
            {mode === "signup" ? "Log in" : "Create an account"}
          </button>
        </p>
      ) : null}
    </form>
  )
}

export function LoginForm(props: Parameters<typeof MagicLinkForm>[0]) {
  const { pricing } = useApp()
  return pricing.mode === "api-key" ? (
    <PasswordLoginForm {...props} />
  ) : (
    <MagicLinkForm {...props} />
  )
}
