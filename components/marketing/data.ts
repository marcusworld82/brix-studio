import "server-only"

import { unstable_rethrow } from "next/navigation"

import { listPresets } from "@/lib/presets"

import { toEffectCard, type EffectCard } from "./effects"

/** Active presets as marketing cards; empty (never throws) when the DB is unavailable. */
export async function loadEffects(): Promise<EffectCard[]> {
  try {
    const presets = await listPresets()
    return presets.map((preset, index) => toEffectCard(preset, index))
  } catch (error) {
    unstable_rethrow(error)
    console.error(
      "[marketing] presets unavailable",
      error instanceof Error ? error.message : error
    )
    return []
  }
}
