"use client"

import { useState, type SyntheticEvent } from "react"
import { Loader2, Video } from "lucide-react"
import { mediaPreviewUrl } from "@/lib/studio/media-preview-url"
import { cn } from "@/lib/utils"

type Props = { src: string; name?: string; className?: string }

/** A paused reference frame, including on phones that do not paint frame zero. */
export function VideoThumbnail(props: Props) {
  return <ThumbnailFrame key={props.src} {...props} />
}

function ThumbnailFrame({ src, name, className }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const loaded = (event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget
    if (video.readyState >= 2 && video.videoWidth > 0) setStatus("ready")
  }
  const previewSrc = mediaPreviewUrl(src)
  return (
    <span
      className={cn(
        "relative block size-full overflow-hidden bg-black/70",
        className
      )}
      data-video-preview={status}
      role="img"
      aria-label={name ? `Video reference: ${name}` : "Video reference"}
    >
      <video
        // A media fragment requests an actual frame rather than metadata alone.
        src={previewSrc.includes("#") ? previewSrc : `${previewSrc}#t=0.1`}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        className="size-full object-cover"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          if (Number.isFinite(video.duration) && video.duration > 0) {
            try {
              video.currentTime = Math.min(0.1, video.duration / 2)
            } catch {
              /* Loading events still handle browsers that defer seeking. */
            }
          }
        }}
        onLoadedData={loaded}
        onSeeked={loaded}
        onCanPlay={loaded}
        onError={() => setStatus("error")}
      />
      {status !== "ready" ? (
        <span
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center text-xs text-white/80"
          aria-live="polite"
        >
          {status === "loading" ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Video className="size-5" aria-hidden />
          )}
          <span>
            {status === "loading" ? "Loading preview…" : "Preview unavailable"}
          </span>
        </span>
      ) : null}
      <span className="absolute inset-x-0 bottom-0 flex min-w-0 items-center gap-1 bg-gradient-to-t from-black/90 to-black/30 px-2 py-1 text-[10px] text-white">
        <Video className="size-3 shrink-0" aria-hidden />
        <span className="truncate" title={name}>
          {name || "Video attached"}
        </span>
      </span>
    </span>
  )
}
