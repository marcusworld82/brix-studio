import type { Metadata } from "next"

import { Atmosphere } from "@/components/marketing/atmosphere"
import { TemplatesView } from "@/components/templates/templates-view"
import { currentUser } from "@/lib/auth/session"
import {
  listMyTemplates,
  listOfficialTemplates,
  type TemplateView,
} from "@/lib/templates"

export const metadata: Metadata = {
  title: "Templates",
  description:
    "Premade BRIX templates and your own saved ones. Pick a template, tweak it and generate.",
}

// Per-user content (My templates), so never statically cached.
export const dynamic = "force-dynamic"

async function safe(load: () => Promise<TemplateView[]>) {
  try {
    return await load()
  } catch (error) {
    console.error(
      "[templates] unavailable",
      error instanceof Error ? error.message : error
    )
    return []
  }
}

export default async function TemplatesPage() {
  const user = await currentUser()
  const [official, mine] = await Promise.all([
    safe(() => listOfficialTemplates()),
    user ? safe(() => listMyTemplates(user)) : Promise.resolve([]),
  ])
  return (
    <div className="relative isolate">
      <Atmosphere glow="top" className="-z-10 h-[420px]" />
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 pt-10 md:px-12 md:pt-14">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-[36px] leading-none text-lime md:text-[56px]">
            Templates
          </h1>
          <p className="max-w-[520px] text-sm text-muted-foreground md:text-base">
            Start from a ready-made template, or save your own. One click loads
            the model, prompt and settings into the generator.
          </p>
        </header>
        <TemplatesView official={official} mine={mine} />
      </div>
    </div>
  )
}
