/** Future server integration contracts. No adapter is implemented or called by the demo. */
export type SubscriptionAccount = {
  userId: string
  displayName: string
  planId: string | null
}
export type ServerQuote = {
  quoteId: string
  userId: string
  modelId: string
  inputHash: string
  credits: number
  providerUsd: number
  expiresAt: string
  priceVersion: string
}
export type CreditEntry = {
  id: string
  userId: string
  delta: number
  reason: "monthly_allocation" | "reserve" | "settle" | "refund"
  referenceId: string
  createdAt: string
}
export interface AccountsAdapter {
  current(): Promise<SubscriptionAccount | null>
  signIn(email: string): Promise<void>
  signOut(): Promise<void>
}
export interface CreditLedgerAdapter {
  balance(): Promise<number>
  entries(
    cursor?: string
  ): Promise<{ entries: CreditEntry[]; nextCursor: string | null }>
  reserve(
    quoteId: string,
    idempotencyKey: string
  ): Promise<{ reservationId: string }>
}
export interface QuoteAdapter {
  quote(input: {
    modelId: string
    settings: Record<string, string | number | boolean>
    prompt: string
    ownedAssetIds: string[]
  }): Promise<ServerQuote>
}
export interface PaymentsAdapter {
  checkout(planId: string): Promise<{ redirectUrl: string }>
  billingPortal(): Promise<{ redirectUrl: string }>
}
