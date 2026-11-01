import type { Metadata } from "next"
import { Suspense } from "react"

import { AutomaticStudio } from "@/components/generator/live-studio"
import { isSupabaseBackend } from "@/lib/backend"
import { GeneratorView } from "@/components/generator/generator-view"
import { listPresets, type PresetView } from "@/lib/presets"

export const metadata: Metadata = {
  title: "Image generator",
  description:
    "Generate images with Soul, Grok, Recraft, Ideogram, Qwen and more.",
}

async function presets(): Promise<PresetView[]> {
  try {
    return (await listPresets()).filter((preset) => preset.surface === "image")
  } catch {
    return []
  }
}

export default async function ImagePage() {
  return (
    <Suspense>
      {isSupabaseBackend() ? (
        <AutomaticStudio surface="image">
          <GeneratorView surface="image" presets={await presets()} />
        </AutomaticStudio>
      ) : (
        <GeneratorView surface="image" presets={await presets()} />
      )}
    </Suspense>
  )
}
