"use client"
import { useCallback, useEffect, useState } from "react"
import { useApp } from "@/components/providers/app-providers"
import type {
  ProviderPresetCatalog,
  ProviderPresetPage,
} from "@/lib/higgsfield/preset-types"
import { parseProviderPresetPage } from "./catalogs"
export type ProviderPresetState = {
  page: ProviderPresetPage | null
  status: "idle" | "loading" | "ready" | "error"
  error: string
  access: "signin" | "connect" | "ready"
  refresh: () => void
}

/** Account-scoped memory only. Every refresh bypasses browser/server caches. */
export function useProviderPresets(
  catalog: ProviderPresetCatalog | null,
  scope = ""
): ProviderPresetState {
  const { user, pricing } = useApp()
  const access = !user
    ? "signin"
    : pricing.mode === "subscription" || user.apiKeyConnected
      ? "ready"
      : "connect"
  const key = JSON.stringify([
    catalog,
    scope,
    user?.id,
    user?.apiConnectionVersion,
    pricing.mode,
  ])
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{
    key: string
    revision: number
    page: ProviderPresetPage | null
    status: "loading" | "ready" | "error"
    error: string
  }>({ key: "", revision: -1, page: null, status: "loading", error: "" })
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    if (!catalog || access !== "ready") return
    const controller = new AbortController()
    let active = true
    const timer = setTimeout(() => {
      setState((old) => ({
        key,
        revision,
        page: old.key === key ? old.page : null,
        status: "loading",
        error: "",
      }))
      void fetch(
        `/api/provider-presets?catalog=${encodeURIComponent(catalog)}`,
        { cache: "no-store", signal: controller.signal }
      )
        .then(async (response) => {
          const body: unknown = await response.json()
          const page = parseProviderPresetPage(body, catalog)
          if (!response.ok || !page) {
            const error =
              body &&
              typeof body === "object" &&
              "error" in body &&
              typeof body.error === "string"
                ? body.error
                : "The provider catalog could not be verified. Retry or check your API connection."
            throw new Error(error)
          }
          if (active)
            setState({ key, revision, page, status: "ready", error: "" })
        })
        .catch((error: unknown) => {
          if (active)
            setState((old) => ({
              key,
              revision,
              page: old.key === key ? old.page : null,
              status: "error",
              error:
                error instanceof Error
                  ? error.message
                  : "Could not load provider presets.",
            }))
        })
    }, 0)
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [catalog, access, key, revision])
  useEffect(() => {
    if (!catalog || access !== "ready") return
    const timer = setInterval(refresh, 60000)
    window.addEventListener("focus", refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [catalog, access, refresh])
  if (!catalog || access !== "ready")
    return { page: null, status: "idle", error: "", access, refresh }
  const current = state.key === key
  return {
    page: current ? state.page : null,
    status: current && state.revision === revision ? state.status : "loading",
    error: current ? state.error : "",
    access,
    refresh,
  }
}
