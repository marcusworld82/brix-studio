"use client"
import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  saveOpenRouterConnectionAction,
  disconnectOpenRouterConnectionAction,
} from "@/app/actions/openrouter-connections"
import {
  savePlatformConnectionAction,
  disconnectPlatformConnectionAction,
} from "@/app/actions/platform-connections"
import { announceBalanceChange } from "@/components/providers/app-providers"
export function ProviderKeyForm({
  provider = "openrouter",
  label,
  platform = false,
  unavailable = false,
}: {
  provider?: "higgsfield" | "openrouter"
  label?: string
  platform?: boolean
  unavailable?: boolean
}) {
  const router = useRouter()
  const [key, setKey] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const name = provider === "higgsfield" ? "Higgsfield" : "OpenRouter"
  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setMessage("")
    try {
      const result = platform
        ? await savePlatformConnectionAction({ provider, apiKey: key })
        : await saveOpenRouterConnectionAction({ apiKey: key })
      setKey("")
      setMessage(
        result.ok
          ? name + " API key saved. Your key stays encrypted on the server."
          : result.error
      )
      if (result.ok) {
        announceBalanceChange()
        router.refresh()
      }
    } catch {
      setMessage(
        "The provider connection could not be saved. Please try again."
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="studio-backdrop flex max-w-2xl flex-col gap-5 rounded-2xl border border-white/10 p-6">
      <div>
        <h2 className="text-xl font-semibold">
          {platform ? "Studio" : "Your"} {name} API connection
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {platform
            ? "This private owner key funds subscriber generations. Subscribers never receive it."
            : "Use your OpenRouter API account for Nano Banana and GPT Image models. It is separate from your Higgsfield key."}
        </p>
      </div>
      {unavailable ? (
        <p role="status" className="text-sm text-amber-200">
          Provider key storage is unavailable. The owner must complete the
          database setup before a key can be saved.
        </p>
      ) : null}
      {label ? (
        <p className="text-sm">
          Saved key: <span className="font-mono">{label}</span>
        </p>
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm">
          {name} API key
          <input
            className="h-12 rounded-xl border border-white/10 bg-surface px-4"
            type="password"
            name="apiKey"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={4096}
            required
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={"Paste your complete " + name + " API key"}
          />
        </label>
        <button
          className="btn-keycap h-12 rounded-xl font-semibold"
          disabled={pending || unavailable || !key.trim()}
        >
          {pending ? "Saving…" : label ? "Replace API key" : "Connect API key"}
        </button>
      </form>
      {label ? (
        <button
          className="w-fit text-sm underline"
          disabled={pending}
          onClick={async () => {
            setPending(true)
            try {
              const result = platform
                ? await disconnectPlatformConnectionAction(provider)
                : await disconnectOpenRouterConnectionAction()
              setMessage(result.ok ? "API key disconnected." : result.error)
              if (result.ok) router.refresh()
            } finally {
              setPending(false)
            }
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
