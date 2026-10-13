"use client"
import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { setPasswordAction } from "@/app/actions/auth"
export function ResetPasswordForm({ tokenHash }: { tokenHash: string }) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError("")
    try {
      const result = await setPasswordAction({
        tokenHash,
        password,
        confirmPassword,
      })
      if (result.ok) {
        setPassword("")
        setConfirmPassword("")
        router.push(result.data.redirectTo)
        router.refresh()
      } else setError(result.error)
    } catch {
      setError("Couldn't connect. Please try again.")
    } finally {
      setPending(false)
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <h1 className="text-3xl font-semibold">Set your password</h1>
      <p className="text-sm text-muted-foreground">
        Use at least 8 characters. You will log in with this password.
      </p>
      <label className="flex flex-col gap-2">
        New password
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 rounded-xl border border-white/10 bg-surface px-4"
        />
      </label>
      <label className="flex flex-col gap-2">
        Confirm password
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="h-12 rounded-xl border border-white/10 bg-surface px-4"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      <button
        disabled={pending}
        className="btn-keycap h-12 rounded-xl font-semibold"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
      <Link href="/login" className="text-sm underline">
        Back to log in
      </Link>
    </form>
  )
}
