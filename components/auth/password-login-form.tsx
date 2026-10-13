"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import {
  signupAccountAction,
  loginPasswordAction,
  requestPasswordResetAction,
} from "@/app/actions/auth"
import { useApp } from "@/components/providers/app-providers"
import { LogoMark } from "../site/logo"
export function PasswordLoginForm({
  mode = "login",
  callbackUrl = "/",
  reason,
  onModeChange,
}: {
  mode?: "login" | "signup"
  callbackUrl?: string
  reason?: string
  onModeChange?: (mode: "login" | "signup") => void
}) {
  const router = useRouter()
  const { closeAuth } = useApp()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [consent, setConsent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [sent, setSent] = useState<"signup" | "recovery" | null>(null)
  const [forgot, setForgot] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError("")
    try {
      if (forgot) {
        const result = await requestPasswordResetAction({ email })
        if (result.ok) setSent("recovery")
        else setError(result.error)
      } else if (mode === "signup") {
        const result = await signupAccountAction({
          email,
          password,
          confirmPassword,
          consent,
          callbackUrl,
        })
        if (result.ok) {
          setPassword("")
          setConfirmPassword("")
          setSent("signup")
        } else setError(result.error)
      } else {
        const result = await loginPasswordAction({
          email,
          password,
          callbackUrl,
        })
        if (result.ok) {
          setPassword("")
          closeAuth()
          router.push(result.data.redirectTo)
          router.refresh()
        } else setError(result.error)
      }
    } catch {
      setError("Couldn't connect. Please try again.")
    } finally {
      setPending(false)
    }
  }
  if (sent)
    return (
      <div className="flex flex-col gap-4" aria-live="polite">
        <h2 className="text-3xl font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          {sent === "signup"
            ? `We sent a verification link to ${email}. Verify your email, then return here and log in with your email and password.`
            : `If ${email} has a BRIX account, you will receive a link to set your password. Check your inbox and spam.`}
        </p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          onClick={closeAuth}
          className="text-lime underline"
        >
          Back to log in
        </Link>
        <button
          type="button"
          className="text-left text-sm underline"
          onClick={() => setSent(null)}
        >
          Try again
        </button>
      </div>
    )
  const inputClass =
    "h-12 rounded-xl border border-white/10 bg-surface px-4 text-base focus:border-lime/60 focus:outline-none"
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-5">
      <LogoMark className="size-8" />
      <div>
        <h2 className="text-3xl font-semibold">
          {forgot
            ? "Set or reset your password"
            : mode === "signup"
              ? "Create your BRIX account"
              : "Welcome back"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {forgot
            ? "Enter your email to receive a password reset link."
            : (reason ??
              (mode === "signup"
                ? "Create a password and verify your email once."
                : "Log in with your email and password."))}
        </p>
      </div>
      <label className="flex flex-col gap-2">
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </label>
      {!forgot ? (
        <>
          <label className="flex flex-col gap-2">
            <span>{mode === "signup" ? "Create password" : "Password"}</span>
            <input
              name="password"
              type="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              maxLength={128}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            {mode === "signup" ? (
              <span className="text-xs text-muted-foreground">
                Use at least 8 characters.
              </span>
            ) : null}
          </label>
          {mode === "signup" ? (
            <>
              <label className="flex flex-col gap-2">
                <span>Confirm password</span>
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 size-5"
                />
                <span>
                  I agree to the{" "}
                  <Link href="/legal/terms" className="underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/legal/privacy" className="underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
            </>
          ) : (
            <button
              type="button"
              className="text-left text-sm text-lime underline"
              onClick={() => {
                setForgot(true)
                setError("")
                setPassword("")
              }}
            >
              Forgot password?
            </button>
          )}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      <button
        disabled={pending}
        className="btn-keycap h-12 rounded-xl font-semibold"
      >
        {pending
          ? "Please wait…"
          : forgot
            ? "Send reset link"
            : mode === "signup"
              ? "Create account"
              : "Log in"}
      </button>
      {forgot ? (
        <button
          type="button"
          className="text-sm underline"
          onClick={() => {
            setForgot(false)
            setError("")
          }}
        >
          Back to log in
        </button>
      ) : onModeChange ? (
        <p className="text-center text-sm">
          {mode === "signup" ? "Already have an account? " : "New here? "}
          <button
            type="button"
            className="text-lime underline"
            onClick={() => {
              setError("")
              setPassword("")
              setConfirmPassword("")
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
