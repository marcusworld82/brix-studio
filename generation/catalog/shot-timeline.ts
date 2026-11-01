/**
 * BRIX price consistency for Kling 3's custom shots. The native Kling docs
 * describe equal shot/total durations; HF omits that cross-field rule. We keep
 * both representations equal so the duration being priced is unambiguous.
 * https://kling.ai/document-api/api/video/3-0-omni/text-to-video/legacy
 */
export function validateLiveShotTimeline(
  definition: { path: string },
  input: Record<string, unknown>
): string[] {
  if (
    !/^kling-video\/v3\.0\/(?:std|pro|4k)\/(?:text-to-video|image-to-video)$/.test(
      definition.path
    ) ||
    !Array.isArray(input.multi_prompt) ||
    !input.multi_prompt.length
  )
    return []

  let total = 0
  const shots: unknown[] = input.multi_prompt
  for (const shot of shots) {
    const duration: unknown =
      shot && typeof shot === "object" && "duration" in shot
        ? shot.duration
        : undefined
    if (
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration <= 0
    )
      return ["Set a valid length for every shot before generating."]
    total += duration
  }
  // The live schema owns allowed ranges and integer/fractional types. Do not
  // freeze today's model limits here and defeat future schema updates.
  return typeof input.duration !== "number" ||
    !Number.isFinite(input.duration) ||
    Math.abs(total - input.duration) > 0.0000001
    ? [
        "To price this request, shot lengths must add up to the selected duration.",
      ]
    : []
}
