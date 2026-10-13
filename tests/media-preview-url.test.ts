import { describe, it, expect } from "vitest"
import { mediaPreviewUrl } from "@/lib/studio/media-preview-url"
describe("Private media preview URLs", () => {
  const storage = "https://project.supabase.co"
  it("reopens persisted uploads through the ownership-checked route instead of an expired token", () => {
    expect(
      mediaPreviewUrl(
        `${storage}/storage/v1/object/sign/brix-media/owner/uploads/clip.mp4?token=expired`,
        storage
      )
    ).toBe("/api/media/owner/uploads/clip.mp4")
  })
  it("preserves playback URLs outside this project's private bucket", () => {
    for (const src of [
      "blob:https://brix.example/clip",
      "/api/media/owner/clip.mp4",
      "https://other.supabase.co/storage/v1/object/sign/brix-media/clip.mp4",
      `${storage}/storage/v1/object/public/other/clip.mp4`,
    ])
      expect(mediaPreviewUrl(src, storage)).toBe(src)
  })
  it("keeps existing media URL fragments on unrelated URLs", () => {
    const src = "https://example.com/clip.mp4#t=3"
    expect(mediaPreviewUrl(src, storage)).toBe(src)
  })
})
