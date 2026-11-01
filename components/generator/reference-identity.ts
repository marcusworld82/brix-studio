import { mediaPreviewUrl } from "@/lib/studio/media-preview-url"

/** Match owned media across refreshed signed URLs, preserving the submit URL. */
export function referenceIdentity(src: string): string {
  const preview = mediaPreviewUrl(src)
  try {
    const parsed = new URL(preview, "https://brix.invalid")
    if (parsed.pathname.startsWith("/api/media/")) return parsed.pathname
  } catch {
    /* Non-URL input stays distinct. */
  }
  return preview
}
export function referenceIndex(urls: string[], src: string): number {
  const identity = referenceIdentity(src)
  return urls.findIndex((url) => referenceIdentity(url) === identity)
}
