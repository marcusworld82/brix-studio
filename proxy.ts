import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { isSupabaseBackend } from "@/lib/backend"

/**
 * Next 16 proxy (formerly middleware). UX only: bounce signed-out visitors
 * away from private pages. It only checks that a session cookie exists —
 * every route handler and server action still calls auth() and checks
 * ownership itself. Never rely on this for security.
 */
const PRIVATE = ["/assets", "/account", "/admin", "/projects"]
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
]

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (isSupabaseBackend()) {
    let response = NextResponse.next({ request })
    const client = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookieOptions: {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (values) => {
            values.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            response = NextResponse.next({ request })
            values.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )
    const {
      data: { user },
    } = await client.auth.getUser()
    if (
      !user &&
      PRIVATE.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      )
    ) {
      const login = new URL("/login", request.url)
      login.searchParams.set("callbackUrl", `${pathname}${search}`)
      const redirected = NextResponse.redirect(login)
      response.cookies
        .getAll()
        .forEach((cookie) => redirected.cookies.set(cookie))
      return redirected
    }
    return response
  }
  if (
    !PRIVATE.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  )
    return NextResponse.next()
  const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name))
  if (signedIn) return NextResponse.next()
  const login = new URL("/login", request.url)
  login.searchParams.set("callbackUrl", `${pathname}${search}`)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|media/|model-icons/|api/webhooks/|api/cron/).*)",
  ],
}
