import type { GalleryItem } from "@/components/studio/gallery/gallery-types"
import type { AssetLibraryItem } from "@/lib/studio/uploads"
import type { GenerationView } from "@/lib/generations/view"

const FAILURE_LABEL: Record<string, string> = {
  nsfw: "Blocked by content filter. Credits refunded.",
  canceled: "Canceled. Credits refunded.",
}

/** One feed tile per output; a running or failed run is a single placeholder tile. */
export function runToGalleryItems(run: GenerationView): GalleryItem[] {
  const base = {
    runId: run.id,
    ...(run.projectId ? { projectId: run.projectId } : {}),
    createdAt: run.createdAt,
    width: run.aspect || 1,
    height: 1,
    prompt: run.prompt,
    alt: run.prompt || run.modelLabel,
    modelLabel: run.modelLabel,
    settings: run.settings,
    groupId: "all",
    groupLabel: "",
    generation: run,
  }
  if (run.status !== "completed" || run.outputs.length === 0) {
    const inFlight =
      run.status === "pending_submit" ||
      run.status === "queued" ||
      run.status === "in_progress"
    return [
      {
        ...base,
        id: run.id,
        kind: run.surface,
        status: inFlight ? "generating" : "failed",
        ...(inFlight
          ? {
              phase:
                run.status === "queued"
                  ? ("queued" as const)
                  : run.status === "in_progress"
                    ? ("in_progress" as const)
                    : ("starting" as const),
            }
          : {
              failureKind: (run.errorKind ??
                run.status) as GalleryItem["failureKind"],
              failureLabel:
                run.error ??
                (run.billingSource === "higgsfield-api"
                  ? "Higgsfield could not finish this generation. Check your API account for billing details."
                  : (FAILURE_LABEL[run.status] ??
                    "The generation failed. Credits refunded.")),
            }),
        src: "",
      },
    ]
  }
  return run.outputs.map((output, index) => ({
    ...base,
    id: run.outputs.length > 1 ? `${run.id}:${index}` : run.id,
    kind: output.kind,
    status: "ready" as const,
    outputIndex: index,
    ...(output.width && output.height
      ? { width: output.width / output.height, height: 1 }
      : {}),
    src: output.kind === "image" ? output.url : "",
    ...(output.kind === "video" ? { videoSrc: output.url } : {}),
    ...(output.kind === "audio" ? { audioSrc: output.url, width: 1.6 } : {}),
  }))
}

export function runToLibraryItems(run: GenerationView): AssetLibraryItem[] {
  if (run.status !== "completed") return []
  return run.outputs.map((output) => ({
    id: output.url,
    src: output.url,
    kind: output.kind,
    name: run.prompt.slice(0, 60) || run.modelLabel,
    source: "generation" as const,
    createdAt: run.createdAt,
    ...(output.durationSec ? { durationSec: output.durationSec } : {}),
  }))
}
