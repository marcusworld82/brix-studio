import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect, unstable_rethrow } from "next/navigation"

import { AuthShowcase } from "@/components/auth/auth-showcase"
import { LoginPanel } from "@/components/marketing/login-panel"
import { currentUser } from "@/lib/auth/session"
import { BRAND } from "@/lib/brand"

export const metadata: Metadata = {
  title: "Log in",
  description: `Sign in to ${BRAND.name} with a magic link. No password needed.`,
  robots: { index: false },
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Only same-site destinations: a path ("/video?model=…") or an absolute URL
 * on this host (Auth.js sometimes passes those). Everything else → "/".
 */
function safeCallback(raw: string | undefined, host: string | null): string {
  if (!raw) return "/"
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\"))
    return raw
  try {
    const url = new URL(raw)
    if (
      host &&
      url.host === host &&
      (url.protocol === "https:" || url.protocol === "http:")
    )
      return `${url.pathname}${url.search}${url.hash}` || "/"
  } catch {
    /* not a URL */
  }
  return "/"
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const host = (await headers()).get("host")
  const callbackUrl = safeCallback(first(params.callbackUrl), host)
  // Never send a signed-in visitor back to the login page itself.
  const destination = callbackUrl.startsWith("/login") ? "/" : callbackUrl

  let signedIn = false
  try {
    signedIn = Boolean(await currentUser())
  } catch (error) {
    // Let Next's control-flow errors through; a DB outage just shows the form.
    unstable_rethrow(error)
    signedIn = false
  }
  if (signedIn) redirect(destination)

  const mode = first(params.mode) === "signup" ? "signup" : "login"
  const reason =
    destination !== "/" ? "Sign in to continue where you left off." : undefined

  return (
    <div className="mx-auto flex w-full max-w-[1152px] px-4 py-8 md:py-12">
      <div className="studio-backdrop flex w-full overflow-hidden rounded-3xl border border-hairline md:min-h-[min(720px,calc(100dvh-10rem))]">
        <div className="hidden w-1/2 p-3 md:block">
          <AuthShowcase />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 md:p-14">
          <div className="w-full max-w-[383px]">
            <LoginPanel
              initialMode={mode}
              callbackUrl={destination}
              reason={reason}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
