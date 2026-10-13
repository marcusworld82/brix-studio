"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronRight, Wand2 } from "lucide-react"

import { PromptBox } from "@/components/studio/prompt-box"
import { SaveTemplateButton } from "@/components/templates/save-template-button"
import { StudioPromptBox } from "@/components/studio/studio-prompt-box"
import type { Surface } from "@/generation/catalog/types"
import type { PresetView } from "@/lib/presets"
import { cn } from "@/lib/utils"

import { Canvas } from "./canvas"
import { ControlPanel, GenerateButton } from "./control-panel"
import { ModelIcon, ModelPicker } from "./model-picker"
import { useGenerator, type Generator } from "./use-generator"

/**
 * Generator page body. Video and audio follow the site's left control panel +
 * canvas layout; image uses the bottom-docked prompt bar over the canvas.
 * Mobile stacks the panel above the feed with a bottom-pinned Generate.
 */
export function GeneratorView({
  surface,
  presets,
}: {
  surface: Surface
  presets: PresetView[]
}) {
  const generator = useGenerator(surface, presets)
  if (!generator.model)
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        No {surface} models are available right now.
      </div>
    )
  return surface === "image" ? (
    <ImageLayout generator={generator} />
  ) : (
    <PanelLayout generator={generator} />
  )
}

function PanelLayout({ generator }: { generator: Generator }) {
  return (
    <div className="flex min-h-0 w-full max-w-full min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto p-2 md:flex-row md:overflow-hidden md:p-4 md:pt-2">
        <ControlPanel generator={generator} />
        <Canvas generator={generator} />
      </div>
      {/* Mobile: keep Generate reachable at the bottom of the screen. */}
      <div className="z-20 shrink-0 border-t border-white/5 bg-page/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <GenerateButton generator={generator} />
      </div>
    </div>
  )
}

function ImageLayout({ generator }: { generator: Generator }) {
  const dockRef = useRef<HTMLDivElement>(null)
  const [dockHeight, setDockHeight] = useState(180)
  useEffect(() => {
    const node = dockRef.current
    if (!node) return
    const observer = new ResizeObserver(() =>
      setDockHeight(node.getBoundingClientRect().height)
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const { model } = generator
  if (!model) return null
  const enhanceKey = model.enhanceSetting
  const enhanceOn =
    enhanceKey && typeof generator.settings[enhanceKey] === "boolean"
      ? (generator.settings[enhanceKey] as boolean)
      : enhanceKey
        ? model.settings[enhanceKey]?.default === true
        : false

  return (
    <div className="relative flex min-h-0 flex-1 flex-col p-2 md:p-4 md:pt-2">
      <Canvas
        generator={generator}
        bottomInset={dockHeight + 16}
        className="md:min-h-0"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-3 md:px-6 md:pb-6">
        <div
          ref={dockRef}
          className="pointer-events-auto w-full max-w-[1120px]"
        >
          <StudioPromptBox
            skin="glass"
            className="w-full"
            surfaces={[generator.surface]}
            surface={generator.surface}
            onSurfaceChange={() => undefined}
            models={generator.models}
            model={model}
            onModelChange={generator.chooseModel}
            settings={generator.settings}
            onSettingChange={generator.setSetting}
            inputMode={generator.inputMode}
            media={generator.media}
            onMediaAdd={generator.addMedia}
            onMediaRemove={generator.removeMedia}
            onMediaRoleChange={generator.changeRole}
            library={generator.library}
            placeholder={
              generator.preset
                ? `Describe your subject — ${generator.preset.title} adds the look`
                : "Describe the scene you imagine"
            }
            prompt={generator.prompt}
            onPromptChange={generator.setPrompt}
            cost={generator.priceLabel ?? generator.quote?.credits}
            onGenerate={() => void generator.generate()}
            onCancel={() => undefined}
            generating={false}
            canceling={false}
            generateDisabled={!generator.canGenerate}
            disabledReason={generator.disabledReason}
            error={generator.error ?? undefined}
            modelSlot={
              <ModelPicker
                models={generator.models}
                value={model.id}
                onChange={generator.chooseModel}
                trigger={
                  <PromptBox.Pill
                    aria-label={`Model: ${model.label}`}
                    start={<ModelIcon model={model} className="size-4" />}
                    end={<ChevronRight />}
                  >
                    {model.label}
                  </PromptBox.Pill>
                }
              />
            }
            extraActions={
              <>
                {enhanceKey ? (
                  <PromptBox.Pill
                    role="switch"
                    aria-checked={enhanceOn}
                    onClick={() => generator.setSetting(enhanceKey, !enhanceOn)}
                    start={<Wand2 />}
                    className={cn(enhanceOn && "text-lime")}
                  >
                    Enhance
                  </PromptBox.Pill>
                ) : null}
                <SaveTemplateButton generator={generator} variant="pill" />
                {generator.preset ? (
                  <PromptBox.Pill
                    onClick={generator.clearPreset}
                    aria-label="Remove effect"
                  >
                    {generator.preset.title} ×
                  </PromptBox.Pill>
                ) : null}
              </>
            }
          />
        </div>
      </div>
    </div>
  )
}
