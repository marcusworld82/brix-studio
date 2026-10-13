"use server"

import { listLedger, type LedgerEntryView } from "@/lib/account"
import { runAction } from "@/lib/action-result"
import type { ActionResult } from "@/lib/action-types"
import { requireUser } from "@/lib/auth/session"
import { isSupabaseBackend } from "@/lib/backend"

export async function loadLedgerAction(
  cursor: string
): Promise<
  ActionResult<{ items: LedgerEntryView[]; nextCursor: string | null }>
> {
  return runAction(async () => {
    const user = await requireUser()
    return isSupabaseBackend()
      ? { items: [], nextCursor: null }
      : listLedger(user.objectId, cursor)
  })
}
