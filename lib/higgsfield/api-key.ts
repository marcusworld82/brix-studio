/** The complete copied provider key is opaque. Never split or reassemble it. */
export const MAX_API_KEY_LENGTH = 4096
export function isCompleteApiKey(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_API_KEY_LENGTH &&
    /^[\x21-\x7e]+$/.test(value)
  )
}
