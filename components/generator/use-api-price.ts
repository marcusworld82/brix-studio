"use client"
import { useEffect, useState } from "react"
import { BALANCE_EVENT } from "@/components/providers/app-providers"
import type { SubmitInput } from "@/lib/generations/submit"
type Quote = {
  key: string
  status: "idle" | "loading" | "ready" | "error" | "variable"
  usd: number | null
  error?: string
}
export function useApiPrice(
  input: Omit<SubmitInput, "submitKey"> | null,
  enabled: boolean,
  version?: string
) {
  const [refresh, setRefresh] = useState(0)
  const key = JSON.stringify({ input, version, refresh })
  const [state, setState] = useState<Quote>({
    key: "",
    status: "idle",
    usd: null,
  })
  useEffect(() => {
    const update = () => setRefresh((v) => v + 1)
    window.addEventListener(BALANCE_EVENT, update)
    return () => window.removeEventListener(BALANCE_EVENT, update)
  }, [])
  useEffect(() => {
    if (!enabled || !input) return
    const controller = new AbortController()
    let active = true
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/generations/estimate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...input, submitKey: crypto.randomUUID() }),
          signal: controller.signal,
          cache: "no-store",
        })
        const data = await response.json()
        if (!response.ok)
          throw new Error(data.error ?? "Couldn't load the generation price.")
        if (
          data.status === "ready" &&
          (!Number.isFinite(data.usd) || data.usd < 0)
        )
          throw new Error("Higgsfield returned an invalid dollar price.")
        if (active)
          setState({
            key,
            status: data.status === "ready" ? "ready" : "variable",
            usd: data.status === "ready" ? data.usd : null,
            error: data.description,
          })
      } catch (error) {
        if (active)
          setState({
            key,
            status: "error",
            usd: null,
            error:
              error instanceof Error
                ? error.message
                : "Couldn't load the price.",
          })
      }
    }, 350)
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
    // The serialized key covers every input and the current connection version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  return !enabled || !input
    ? { status: "idle" as const, usd: null, error: undefined }
    : state.key === key
      ? state
      : { status: "loading" as const, usd: null, error: undefined }
}
