import "server-only"
import { createSupabaseServiceClient } from "./server"
import { settleSubscriptionGeneration } from "./subscription-billing"
/** Completion and credit settlement can be retried independently without repeating a paid request. */
export async function reconcileCreditSettlements() {
  const client =
    createSupabaseServiceClient() as unknown as import("@supabase/supabase-js").SupabaseClient
  const { data, error } = await client.rpc("brix_pending_credit_settlements")
  if (error) throw new Error("Credit reconciliation is unavailable.")
  let pending = 0
  for (const row of data ?? []) {
    try {
      await settleSubscriptionGeneration(
        row.id,
        row.status === "completed" ? "complete" : "failed"
      )
    } catch {
      pending++
    }
  }
  return { checked: data?.length ?? 0, pending }
}
