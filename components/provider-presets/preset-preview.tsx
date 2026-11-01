"use client"
import Image from "next/image"
import { Film, ImageIcon } from "lucide-react"
import type { ProviderPreset } from "@/lib/higgsfield/preset-types"
import { presetPreviewUrl } from "./catalogs"

export function PresetPreview({
  preset,
  video = false,
  large = false,
}: {
  preset: ProviderPreset
  video?: boolean
  large?: boolean
}) {
  const image = presetPreviewUrl(preset.previewImage),
    clip = presetPreviewUrl(preset.previewVideo)
  return (
    <div
      className={`relative flex w-full items-center justify-center overflow-hidden bg-[#1d232b] ${large ? "aspect-video" : "aspect-[4/3]"}`}
    >
      {clip && video ? (
        <video
          src={clip}
          poster={image ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="size-full object-contain"
          aria-label={`${preset.name} preview`}
        />
      ) : image ? (
        <Image
          unoptimized
          src={image}
          alt={`${preset.name} provider preview`}
          fill
          sizes={large ? "80vw" : "(max-width:640px) 50vw, 25vw"}
          className="object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-2 p-4 text-center text-white/40">
          {clip ? (
            <Film className="size-7" />
          ) : (
            <ImageIcon className="size-7" />
          )}
          <span className="text-xs">
            {clip ? "Open preview to watch" : "No preview available"}
          </span>
        </div>
      )}
    </div>
  )
}
