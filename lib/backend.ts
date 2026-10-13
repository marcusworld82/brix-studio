/** Server-side backend selection. Legacy is kept only during migration. */
export function isSupabaseBackend(): boolean {
  return process.env.APP_BACKEND === "supabase"
}
