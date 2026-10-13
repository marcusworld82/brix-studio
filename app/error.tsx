"use client"

import Link from "next/link"
import { useEffect } from "react"
import { RotateCw } from "lucide-react"

import { LogoMark } from "@/components/site/logo"

/**
 * Route-level error boundary: an on-brand 500 with retry. It sits inside the
 * root layout, so providers, toasts and modals keep working.
 */
export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error.digest ?? error.message)
  }, [error])

  return (
    <main
      id="main"
      className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-20"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 50% 50%, rgba(5,130,202,0.12) 0%, transparent 70%)",
        }}
      />
      <div className="flex max-w-[520px] flex-col items-center gap-5 text-center">
        <Link href="/" aria-label="Home">
          <LogoMark className="size-10" />
        </Link>
        <p
          aria-hidden
          className="font-display text-[96px] leading-none text-lime md:text-[140px]"
        >
          500
        </p>
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">
          Something went wrong on our side
        </h1>
        <p className="text-sm text-muted-foreground md:text-base">
          The page hit an unexpected error. Your generations and credits are
          safe. Try again, or head back home.
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-white/30">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => retry()}
            className="btn-keycap inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold"
          >
            <RotateCw className="size-4" aria-hidden /> Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 px-6 text-base font-medium transition-colors hover:bg-white/5"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  )
}
