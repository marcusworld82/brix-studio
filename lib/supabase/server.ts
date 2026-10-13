import "server-only"

import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

import type { SupabaseDatabase } from "./database"

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error("BRIX Supabase project is not configured.")
  return { url, key }
}

/** A fresh cookie-bound client for each request, never a shared user session. */
export async function createSupabaseSessionClient() {
  const { url, key } = publicConfig()
  const store = await cookies()
  return createServerClient<SupabaseDatabase>(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            store.set(name, value, options)
          )
        } catch (caught) {
          // Read-only Server Components rely on the auth-refresh proxy.
          if (
            !(caught instanceof Error) ||
            !caught.message.includes("Cookies can only be modified")
          )
            throw caught
        }
      },
    },
  })
}

/** Server-only privileged client. Authenticate and scope the caller first. */
export function createSupabaseServiceClient() {
  const { url } = publicConfig()
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret) throw new Error("BRIX Supabase server key is not configured.")
  return createClient<SupabaseDatabase>(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
