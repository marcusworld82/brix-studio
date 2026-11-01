const brandName = process.env.NEXT_PUBLIC_BRAND_NAME || "BRIX"
const accent = process.env.NEXT_PUBLIC_BRAND_ACCENT || "#0582ca"

/** Public brand constants, safe for client and server. */
export const BRAND = {
  name: brandName,
  initials: (process.env.NEXT_PUBLIC_BRAND_INITIALS || "B").slice(0, 4),
  accent: /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#0582ca",
  tagline: "An AI studio for images and video",
  description: `${brandName} is an AI studio for images and video. Sign in with email and generate using your own Higgsfield API key.`,
  productionUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
  /** Dismissible promo bar above the nav; empty string hides it. */
  promo: process.env.NEXT_PUBLIC_PROMO_BAR ?? "",
  promoHref: process.env.NEXT_PUBLIC_PROMO_HREF ?? "/pricing",
} as const
