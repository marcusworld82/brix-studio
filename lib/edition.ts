/** Both deployment editions share the complete BRIX studio. */
export function isSubscriptionEdition(): boolean {
  return process.env.BRIX_EDITION === "subscription"
}
