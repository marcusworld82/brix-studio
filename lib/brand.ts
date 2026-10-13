/** Public brand constants, safe for client and server. */
export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "BRIX",
  tagline: "An AI studio for images and video",
  description:
    "BRIX is an AI studio for images and video. Sign in with email and generate using your own Higgsfield API key.",
  productionUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  supportEmail: "",
  /** Dismissible promo bar above the nav; empty string hides it. */
  promo: process.env.NEXT_PUBLIC_PROMO_BAR ?? "",
  promoHref: process.env.NEXT_PUBLIC_PROMO_HREF ?? "/pricing",
} as const
