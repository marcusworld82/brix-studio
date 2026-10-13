import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, MailCheck } from "lucide-react"

import { Atmosphere } from "@/components/marketing/atmosphere"
import { BRAND } from "@/lib/brand"

export const metadata: Metadata = {
  title: "Check your email",
  robots: { index: false },
}

export default function CheckEmailPage() {
  return (
    <div className="mx-auto flex w-full max-w-[560px] px-4 py-12 md:py-20">
      <div className="relative isolate flex w-full flex-col items-center gap-5 overflow-hidden rounded-3xl border border-hairline bg-panel px-6 py-12 text-center md:px-12">
        <Atmosphere glow="top" className="-z-10" />
        <span className="flex size-14 items-center justify-center rounded-2xl bg-lime/10 text-lime ring-1 ring-lime/20">
          <MailCheck className="size-7" aria-hidden />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-[30px] leading-tight font-semibold tracking-tight">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground">
            Open the verification or password reset link we sent. Then return to{" "}
            {BRAND.name} and log in with your email and password. The link works
            once.
          </p>
        </div>
        <ul className="flex w-full flex-col gap-2 rounded-2xl bg-surface p-4 text-left text-sm text-muted-foreground">
          <li>
            • Nothing yet? Give it a minute, then check spam or promotions.
          </li>
          <li>• Make sure you typed the address you meant to use.</li>
        </ul>
        <Link
          href="/login"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/5 px-5 text-sm font-medium transition-colors hover:bg-white/10"
        >
          <ArrowLeft className="size-4" aria-hidden /> Use a different email
        </Link>
      </div>
    </div>
  )
}
