"use client"

import { useState } from "react"
import { BookmarkPlus } from "lucide-react"

import type { Generator } from "@/components/generator/use-generator"
import { useToast } from "@/components/providers/app-providers"
import { PromptBox } from "@/components/studio/prompt-box"
import { cn } from "@/lib/utils"

import { SaveTemplateDialog, type TemplateRecipe } from "./save-template-dialog"

/** Saves the generator's current model, prompt and settings as a template. */
export function SaveTemplateButton({
  generator,
  variant,
  className,
}: {
  generator: Generator
  variant: "pill" | "panel"
  className?: string
}) {
  const toast = useToast()
  const [recipe, setRecipe] = useState<TemplateRecipe | null>(null)
  const { model } = generator
  if (!model) return null

  const open = () => {
    const prompt = generator.prompt.trim()
    if (!prompt) return toast.info("Write a prompt first, then save it")
    setRecipe({
      surface: generator.surface,
      modelId: model.id,
      prompt,
      settings: generator.settings,
    })
  }

  return (
    <>
      {variant === "pill" ? (
        <PromptBox.Pill
          onClick={open}
          start={<BookmarkPlus />}
          className={className}
        >
          Save template
        </PromptBox.Pill>
      ) : (
        <button
          type="button"
          onClick={open}
          className={cn(
            "flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] bg-white/5 text-sm font-medium text-foreground transition-colors hover:bg-white/10",
            className
          )}
        >
          <BookmarkPlus className="size-4" aria-hidden /> Save as template
        </button>
      )}
      <SaveTemplateDialog recipe={recipe} onClose={() => setRecipe(null)} />
    </>
  )
}
