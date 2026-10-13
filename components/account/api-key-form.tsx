"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  saveApiConnectionAction,
  disconnectApiConnectionAction,
} from "@/app/actions/api-connections"

export function ApiKeyForm({ label, next }: { label?: string; next?: string }) {
  const router = useRouter()
  const [keyId, setKeyId] = useState("")
  const [keySecret, setKeySecret] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setMessage("")
    const result = await saveApiConnectionAction({ keyId, keySecret })
    setPending(false)
    setKeySecret("")
    if (!result.ok) {
      setMessage(result.error)
      return
    }
    setKeyId("")
    setMessage("API key saved. Higgsfield validates it when you generate.")
    router.refresh()
    if (next && next !== "/") router.push(next)
  }
  return (
    <section className="studio-backdrop flex max-w-2xl flex-col gap-5 rounded-2xl border border-white/10 p-6">
      <div>
        <h2 className="text-xl font-semibold">
          Your Higgsfield API connection
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Generations use your own Higgsfield API balance. Your subscription
          login is not needed.
        </p>
      </div>
      {label ? (
        <p className="text-sm">
          Saved key: <span className="font-mono">{label}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect a key before generating.
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm">
          API key ID
          <input
            name="keyId"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            autoComplete="off"
            required
            className="h-12 rounded-xl border border-white/10 bg-surface px-4"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          API key secret
          <input
            name="keySecret"
            type="password"
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
            autoComplete="new-password"
            required
            className="h-12 rounded-xl border border-white/10 bg-surface px-4"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Find both values in your Higgsfield API console. Keys are encrypted on
          the server and never displayed back to you.
        </p>
        <button
          disabled={pending || !keyId || !keySecret}
          className="btn-keycap h-12 rounded-xl font-semibold"
        >
          {pending ? "Saving…" : label ? "Replace API key" : "Save API key"}
        </button>
      </form>
      {label ? (
        <button
          type="button"
          disabled={pending}
          className="w-fit text-sm text-muted-foreground underline"
          onClick={async () => {
            setPending(true)
            const result = await disconnectApiConnectionAction()
            setPending(false)
            setMessage(
              result.ok
                ? "API key disconnected. Existing jobs keep their original connection until they finish."
                : result.error
            )
            if (result.ok) router.refresh()
          }}
        >
          Disconnect API key
        </button>
      ) : null}
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  )
}
