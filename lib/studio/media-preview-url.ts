/** Keep private previews usable after a persisted Supabase signed URL expires. */
export function mediaPreviewUrl(
  src: string,
  storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
): string {
  if (!storageOrigin) return src
  try {
    const url = new URL(src)
    const prefix = "/storage/v1/object/sign/brix-media/"
    if (
      url.origin === new URL(storageOrigin).origin &&
      url.pathname.startsWith(prefix)
    ) {
      // Our authenticated route checks ownership and issues a fresh signed URL.
      return `/api/media/${url.pathname.slice(prefix.length)}`
    }
  } catch {
    /* Relative and blob URLs remain valid local previews. */
  }
  return src
}
