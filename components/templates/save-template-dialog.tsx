"use client"

import { useEffect, useState } from "react"

import { saveTemplateAction } from "@/app/actions/templates"
import { useApp, useToast } from "@/components/providers/app-providers"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Surface } from "@/generation/catalog/types"

export interface TemplateRecipe {
  surface: Surface
  modelId: string
  prompt: string
  settings: Record<string, unknown>
  coverUrl?: string
}

const field =
  "h-10 rounded-lg border border-white/10 bg-surface px-3 text-sm outline-none focus:border-lime/50"

/** Name + description, then saves the recipe to the user's own templates. */
export function SaveTemplateDialog({
  recipe,
  onClose,
}: {
  recipe: TemplateRecipe | null
  onClose: () => void
}) {
  const { user, openAuth } = useApp()

  // Saving needs an account; sign in first, the dock keeps the prompt.
  useEffect(() => {
    if (recipe && !user) {
      onClose()
      openAuth()
    }
  }, [recipe, user, onClose, openAuth])

  return (
    <Dialog open={recipe !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        {recipe && user ? (
          <SaveTemplateForm recipe={recipe} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SaveTemplateForm({
  recipe,
  onClose,
}: {
  recipe: TemplateRecipe
  onClose: () => void
}) {
  const toast = useToast()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        setError(null)
        const result = await saveTemplateAction({
          title,
          description,
          surface: recipe.surface,
          modelId: recipe.modelId,
          prompt: recipe.prompt,
          settings: recipe.settings,
          ...(recipe.coverUrl ? { coverUrl: recipe.coverUrl } : {}),
        })
        setBusy(false)
        if (!result.ok) return setError(result.error)
        toast.success("Saved to My templates")
        onClose()
      }}
    >
      <DialogHeader>
        <DialogTitle>Save as template</DialogTitle>
        <DialogDescription>
          Keeps the model, prompt and settings so you can reuse them from the
          Templates tab.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              autoFocus
              required
              maxLength={60}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Note (optional)
            <input
              maxLength={240}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={field}
            />
          </label>
          <p className="line-clamp-3 rounded-lg bg-white/5 p-3 text-xs text-muted-foreground">
            {recipe.prompt}
          </p>
          {error ? (
            <p role="alert" className="text-sm text-[#ff6b6b]">
              {error}
            </p>
          ) : null}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Save template
        </Button>
      </DialogFooter>
    </form>
  )
}
