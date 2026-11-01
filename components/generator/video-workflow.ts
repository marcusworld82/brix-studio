import type { LiveModelSummary } from "@/generation/catalog/live-types"

export type VideoWorkflow = "create" | "edit" | "motion"
/** Only explicit operation names classify a mode. Unknown paths remain selectable. */
export function videoWorkflow(path: string): VideoWorkflow | null {
  const parts = path.toLowerCase().split("/").slice(1)
  if (
    parts.some((part) => ["motion-control", "motion-transfer"].includes(part))
  )
    return "motion"
  if (
    parts.some((part) =>
      ["video-edit", "video-to-video", "object-swap"].includes(part)
    )
  )
    return "edit"
  if (
    parts.some((part) =>
      [
        "text-to-video",
        "image-to-video",
        "reference-to-video",
        "first-last-frame",
        "first-last-frame-to-video",
      ].includes(part)
    )
  )
    return "create"
  return null
}
export function workflowModel(
  models: readonly LiveModelSummary[],
  workflow: VideoWorkflow,
  family?: string
) {
  const matches = models.filter(
    (model) =>
      model.surface === "video" && videoWorkflow(model.path) === workflow
  )
  return matches.find((model) => model.family === family) ?? matches[0] ?? null
}
