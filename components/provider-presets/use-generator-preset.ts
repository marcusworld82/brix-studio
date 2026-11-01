"use client"
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import type { LiveModelDefinition } from "@/generation/catalog/live-types"
import {
  isProviderPresetCatalog,
  type ProviderPreset,
} from "@/lib/higgsfield/preset-types"
import {
  presetCatalogForPath,
  PROVIDER_PRESET_CATALOGS,
  verifiedLinkedPreset,
} from "./catalogs"
import { useProviderPresets } from "./use-provider-presets"

type Input = Record<string, unknown>
/** Verified account membership is required before a URL can fill a provider field. */
export function useGeneratorPreset({
  model,
  values,
  setValues,
  setModel,
  requestedModel,
  requestedCatalog,
  requestedId,
  required,
}: {
  model: LiveModelDefinition | null
  values: Input
  setValues: Dispatch<SetStateAction<Input>>
  setModel: Dispatch<SetStateAction<string>>
  requestedModel: string
  requestedCatalog: string | null
  requestedId: string | null
  required: string[]
}) {
  const group = model ? presetCatalogForPath(model.path) : null
  const candidate = group ? PROVIDER_PRESET_CATALOGS[group] : null
  const properties = model?.inputSchema.properties
  const catalog =
    group &&
    candidate &&
    properties &&
    typeof properties === "object" &&
    candidate.field in properties
      ? group
      : null
  const config = catalog ? PROVIDER_PRESET_CATALOGS[catalog] : null
  const data = useProviderPresets(catalog, model?.id)
  const requestKey = JSON.stringify([
    requestedModel,
    requestedCatalog,
    requestedId,
  ])
  const [link, setLink] = useState({
    key: requestKey,
    status: requestedId ? "pending" : "done",
  })
  const [notice, setNotice] = useState("")
  const linkStatus =
    link.key === requestKey ? link.status : requestedId ? "pending" : "done"
  const selectedId =
    config && typeof values[config.field] === "string"
      ? (values[config.field] as string)
      : undefined
  const selected = data.page?.items.find((item) => item.id === selectedId)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setLink({ key: requestKey, status: requestedId ? "pending" : "done" })
      setNotice("")
      if (requestedModel) setModel(requestedModel)
    })
    return () => cancelAnimationFrame(frame)
  }, [requestKey, requestedId, requestedModel, setModel])
  useEffect(() => {
    if (!requestedId || linkStatus !== "pending" || !model) return
    const compatible =
      isProviderPresetCatalog(requestedCatalog) &&
      catalog === requestedCatalog &&
      model.id === requestedModel
    if (!compatible) {
      // A manually selected model abandons the link through abandonLink().
      // Wait while the requested model schema is still loading.
      if (model.id !== requestedModel && requestedModel) return
      const frame = requestAnimationFrame(() => {
        setLink({ key: requestKey, status: "done" })
        setNotice("This preset link is not compatible with the selected model.")
      })
      return () => cancelAnimationFrame(frame)
    }
    if (data.status !== "ready" || !data.page || !config) return
    const match = verifiedLinkedPreset(
      data.page,
      model.id,
      requestedModel,
      requestedCatalog,
      requestedId
    )
    const frame = requestAnimationFrame(() => {
      if (match)
        setValues((old) => ({
          ...old,
          [config.field]: match.id,
          ...(catalog === "marketing" ? { enhance_prompt: true } : {}),
        }))
      setLink({ key: requestKey, status: "done" })
      setNotice(
        match
          ? `${match.name} selected. Add your inputs and review the price before generating.`
          : "This preset is no longer available in your account. Choose another look."
      )
    })
    return () => cancelAnimationFrame(frame)
  }, [
    requestedId,
    requestedModel,
    requestedCatalog,
    requestKey,
    linkStatus,
    model?.id,
    catalog,
    config,
    data.status,
    data.page,
    setValues,
    model,
  ])
  useEffect(() => {
    if (!config || !selectedId || data.status !== "ready" || selected) return
    const frame = requestAnimationFrame(() => {
      setValues((old) => {
        if (old[config.field] !== selectedId) return old
        const next = { ...old }
        delete next[config.field]
        return next
      })
      setNotice(
        "The selected preset is no longer available in your account and was removed. Choose another look."
      )
      setLink({ key: requestKey, status: "done" })
    })
    return () => cancelAnimationFrame(frame)
  }, [
    config,
    selectedId,
    selected,
    data.status,
    data.page,
    setValues,
    requestKey,
  ])
  const choose = (preset: ProviderPreset) => {
    if (
      !config ||
      data.status !== "ready" ||
      !data.page?.items.some((item) => item.id === preset.id)
    )
      return
    setValues((old) => ({
      ...old,
      [config.field]: preset.id,
      ...(catalog === "marketing" ? { enhance_prompt: true } : {}),
    }))
    setLink({ key: requestKey, status: "done" })
    setNotice(`${preset.name} selected. Generation has not started.`)
  }
  const clear = () => {
    if (!config) return
    setValues((old) => {
      const next = { ...old }
      delete next[config.field]
      if (catalog === "marketing") next.enhance_prompt = false
      return next
    })
    setLink({ key: requestKey, status: "done" })
    setNotice("Preset selection cleared.")
  }
  const abandonLink = useCallback(
    () => {
      setLink({ key: requestKey, status: "abandoned" })
      setNotice("")
    },
    [requestKey]
  )
  const problems: string[] = []
  if (config) {
    if (linkStatus === "pending" && requestedId && model?.id === requestedModel)
      problems.push(
        data.access === "ready"
          ? "Verifying the preset link against your current account catalog."
          : "Sign in and connect your API account to verify this preset link."
      )
    if (selectedId && (data.status !== "ready" || !selected))
      problems.push(
        data.error ||
          "The selected preset must be verified before generation. Open its picker or refresh the catalog."
      )
    if (
      (required.includes(config.field) ||
        (catalog === "marketing" && values.enhance_prompt === true)) &&
      !selectedId
    )
      problems.push(
        `Choose an available ${config.pickerLabel.toLowerCase()} before generating.`
      )
  }
  return {
    catalog,
    config,
    data,
    selectedId,
    notice,
    problems,
    choose,
    clear,
    abandonLink,
  }
}
