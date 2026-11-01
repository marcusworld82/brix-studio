import type { Metadata } from "next"
import { Suspense } from "react"

import { AutomaticStudio } from "@/components/generator/live-studio"
import { isSupabaseBackend } from "@/lib/backend"
import { GeneratorView } from "@/components/generator/generator-view"
import { listPresets, type PresetView } from "@/lib/presets"

export const metadata: Metadata = {
  title: "Video generator",
  description:
    "Create, edit and motion-control video with Seedance, Kling, Wan and more.",
}

async function presets(): Promise<PresetView[]> {
  try {
    return (await listPresets()).filter((preset) => preset.surface === "video")
  } catch {
    return []
  }
}

export default async function VideoPage() {
  return (
    <Suspense>
      {isSupabaseBackend() ? (
        <AutomaticStudio surface="video">
          <GeneratorView surface="video" presets={await presets()} />
        </AutomaticStudio>
      ) : (
        <GeneratorView surface="video" presets={await presets()} />
      )}
    </Suspense>
  )
}
