/** Public brand constants, safe for client and server. */
export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "BRIX",
  tagline: "Direct images and video with every frontier model",
  description:
    "BRIX is an AI studio for images and video. Generate with Seedance, Kling, Wan, Soul and more — one credit balance, one library.",
  productionUrl: "https://vireo.studio",
  supportEmail: "support@vireo.studio",
  /** Dismissible promo bar above the nav; empty string hides it. */
  promo: process.env.NEXT_PUBLIC_PROMO_BAR ?? "",
  promoHref: process.env.NEXT_PUBLIC_PROMO_HREF ?? "/pricing",
} as const
