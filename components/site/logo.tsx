import Link from "next/link"

import { BRAND } from "@/lib/brand"
import { cn } from "@/lib/utils"

/** BRIX mark: a BRIX blue tile with a white B. Placeholder mark until brand assets arrive. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" fill="#006494" />
      <path d="M10 8h7.2c3.1 0 5 1.6 5 4.1 0 1.7-.9 2.9-2.4 3.5 1.9.5 3 1.9 3 3.9 0 2.8-2.2 4.5-5.6 4.5H10V8zm3.4 2.7v3.1h3.4c1.3 0 2-.6 2-1.6s-.7-1.5-2-1.5h-3.4zm0 5.7v3.5h3.8c1.4 0 2.2-.7 2.2-1.8s-.8-1.7-2.2-1.7h-3.8z" fill="#ffffff" fillRule="evenodd"/>
    </svg>
  )
}

export function Logo({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <Link
      href="/"
      aria-label={`${BRAND.name} home`}
      className={cn("flex shrink-0 items-center gap-2", className)}
    >
      <LogoMark className={compact ? "size-6" : "size-8"} />
      <span
        className={cn(
          "font-display text-foreground",
          compact ? "text-base" : "text-lg"
        )}
      >
        {BRAND.name}
      </span>
    </Link>
  )
}
