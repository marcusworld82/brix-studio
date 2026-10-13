import type { NextRequest } from "next/server"
import { handlers } from "@/auth"
import { isSupabaseBackend } from "@/lib/backend"
export async function GET(request: NextRequest) {
  return isSupabaseBackend()
    ? new Response(null, { status: 404 })
    : handlers.GET(request)
}
export async function POST(request: NextRequest) {
  return isSupabaseBackend()
    ? new Response(null, { status: 404 })
    : handlers.POST(request)
}
