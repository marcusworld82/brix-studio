import type { Metadata } from "next"
import Link from "next/link"
import { Clock, KeyRound, ShieldAlert, TriangleAlert } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Atmosphere } from "@/components/marketing/atmosphere"
import { BRAND } from "@/lib/brand"

export const metadata: Metadata = {
  title: "Sign-in problem",
  robots: { index: false },
}

type Copy = { icon: LucideIcon; title: string; body: string; action: string }

/** Friendly copy for Auth.js `?error=` codes; anything unknown uses Default. */
const ERRORS: Record<string, Copy> = {
  Verification: {
    icon: Clock,
    title: "That link has expired",
    body: "Sign-in links work once and only for an hour. It may have been used already, or opened after it expired. Return to login to request a new verification or password reset email.",
    action: "Back to log in",
  },
  AccessDenied: {
    icon: ShieldAlert,
    title: "We couldn't let you in",
    body: "This account can't sign in right now. If you think that's a mistake, contact support and we'll sort it out.",
    action: "Back to log in",
  },
  Configuration: {
    icon: KeyRound,
    title: "Sign-in is temporarily unavailable",
    body: "Something is misconfigured on our side, not yours. Please try again in a few minutes.",
    action: "Try again",
  },
  Default: {
    icon: TriangleAlert,
    title: "Something went wrong signing you in",
    body: "The sign-in didn't complete. Start again from the log in page. It usually works on the second try.",
    action: "Back to log in",
  },
}

export default async function LoginErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = (await searchParams).error
  const value = Array.isArray(raw) ? raw[0] : raw
  // Auth.js codes are single words; ignore anything else rather than echo it.
  const code = value && /^[A-Za-z]{1,40}$/.test(value) ? value : undefined
  const copy =
    (code && Object.hasOwn(ERRORS, code) ? ERRORS[code] : undefined) ??
    ERRORS.Default!
  const Icon = copy.icon

  return (
    <div className="mx-auto flex w-full max-w-[560px] px-4 py-12 md:py-20">
      <div className="relative isolate flex w-full flex-col items-center gap-5 overflow-hidden rounded-3xl border border-hairline bg-panel px-6 py-12 text-center md:px-12">
        <Atmosphere glow="top" className="-z-10" />
        <span className="flex size-14 items-center justify-center rounded-2xl bg-white/5 text-foreground ring-1 ring-white/10">
          <Icon className="size-7" aria-hidden />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">
            {copy.title}
          </h1>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="btn-keycap inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold"
          >
            {copy.action}
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white/5 px-5 text-sm font-medium transition-colors hover:bg-white/10"
          >
            Go home
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Need a hand?{" "}
          <a
            href={`mailto:${BRAND.supportEmail}`}
            className="text-foreground underline underline-offset-2"
          >
            {BRAND.supportEmail}
          </a>
          {code ? (
            <span className="block pt-1 text-white/30">Error code: {code}</span>
          ) : null}
        </p>
      </div>
    </div>
  )
}
