export const RATE_UNITS = ["generation", "image", "second"] as const
export type SubscriptionRateUnit = (typeof RATE_UNITS)[number]
/** Read only the server-validated provider body. Conflicting aliases fail closed. */
export function subscriptionRateQuantity(
  unit: SubscriptionRateUnit,
  body: Record<string, unknown> = {}
): number {
  if (unit === "generation") return 1
  const keys =
    unit === "image"
      ? ["n", "num_images", "num_outputs", "batch_size"]
      : ["duration", "duration_seconds", "seconds"]
  const raw = keys.filter((key) => body[key] != null).map((key) => body[key])
  if (
    raw.some(
      (value) =>
        (typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && !/^[0-9]+(?:[.][0-9]+)?$/.test(value))
    )
  )
    throw new Error(
      "The generation quantity is unclear. Check the model settings."
    )
  const values = raw.map((value) => Number(value))
  if (
    unit === "second" &&
    values.some(
      (value) =>
        (String(value).split(".")[1]?.length ?? 0) > 3 ||
        String(value).includes("e")
    )
  )
    throw new Error(
      "Per-second prices support durations with at most three decimal places. Use a per-request price for finer durations."
    )
  if (!values.length) {
    if (unit === "image") return 1
    throw new Error(
      "This model needs an explicit duration before its per-second price can be used."
    )
  }
  if (
    values.some(
      (value) =>
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 100000 ||
        (unit === "image" && !Number.isInteger(value))
    ) ||
    new Set(values).size !== 1
  )
    throw new Error(
      "The generation quantity is unclear. Check the model settings."
    )
  return values[0]!
}
export function creditsFromCustomerPrice(
  usd: number,
  creditUsd: number
): number {
  const credits = usd / creditUsd
  if (
    !Number.isFinite(usd) ||
    usd <= 0 ||
    !Number.isFinite(creditUsd) ||
    creditUsd <= 0 ||
    Math.abs(credits - Math.round(credits)) > 0.0000001 ||
    !Number.isSafeInteger(Math.round(credits))
  )
    throw new Error(
      `Customer prices must be positive multiples of $${creditUsd}.`
    )
  return Math.round(credits)
}

/** Integer milli-unit math keeps the server quote equal to Postgres numeric ceil. */
export function subscriptionRateCredits(
  rate: number,
  quantity: number
): number {
  const scaled = Math.round(quantity * 1000)
  const total = rate * scaled
  if (!Number.isSafeInteger(total) || rate <= 0 || quantity <= 0)
    throw new Error("This request is too large to price.")
  return Math.floor((total + 999) / 1000)
}
