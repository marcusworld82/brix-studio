import { NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { isSupabaseBackend } from "@/lib/backend"
import {
  createSupabaseVerificationClient,
  createSupabaseSessionClient,
} from "@/lib/supabase/server"
import { safeReturnPath } from "@/lib/supabase/auth"
import { env } from "@/lib/env"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const token = params.get("token_hash")
  const type = params.get("type")
  if (isSupabaseBackend()) {
    if (token && type === "signup") {
      const client = createSupabaseVerificationClient()
      const { error } = await client.auth.verifyOtp({
        token_hash: token,
        type: "signup",
      })
      if (!error) {
        await client.auth.signOut()
        await (
          await createSupabaseSessionClient()
        ).auth.signOut({ scope: "local" })
        const login = new URL("/login", env().APP_URL)
        login.searchParams.set("verified", "1")
        login.searchParams.set(
          "callbackUrl",
          safeReturnPath(params.get("next"))
        )
        return NextResponse.redirect(login)
      }
    }
    return NextResponse.redirect(
      new URL("/login/error?error=Verification", env().APP_URL)
    )
  }
  if (token && type && ["magiclink", "signup", "email"].includes(type)) {
    const client = await createSupabaseSessionClient()
    const { error } = await client.auth.verifyOtp({
      token_hash: token,
      type: type as EmailOtpType,
    })
    if (!error)
      return NextResponse.redirect(
        new URL(safeReturnPath(params.get("next")), env().APP_URL)
      )
  }
  return NextResponse.redirect(
    new URL("/login/error?error=Verification", env().APP_URL)
  )
}
