import type { Metadata, Viewport } from "next"
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google"
import { unstable_rethrow } from "next/navigation"

import { AuthModal } from "@/components/auth/auth-modal"
import { UpgradeModal } from "@/components/billing/upgrade-modal"
import {
  AppProviders,
  type ClientUser,
} from "@/components/providers/app-providers"
import { CookieConsent } from "@/components/site/cookie-consent"
import { getBalance } from "@/lib/account"
import { currentUser } from "@/lib/auth/session"
import { isSupabaseBackend } from "@/lib/backend"
import { connectionStatus } from "@/lib/supabase/connections"
import { BRAND } from "@/lib/brand"
import { clientPricing, type ClientPricing } from "@/lib/billing/pricing"
import { cn } from "@/lib/utils"

import "./globals.css"

// The three Quanta families; globals.css maps them onto --hf-type-family-*-base.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
})
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? BRAND.productionUrl),
  title: {
    default: `${BRAND.name} — AI image & video studio`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  openGraph: {
    title: `${BRAND.name} — AI image & video studio`,
    description: BRAND.description,
    images: ["/media/hero/coast.jpg"],
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
}

export const viewport: Viewport = { themeColor: "#0f1113", colorScheme: "dark" }

/** Session, live balance and pricing for the client providers. Signed-out on DB errors. */
async function bootstrap(): Promise<{
  user: ClientUser | null
  credits: number | null
  pricing: ClientPricing
}> {
  const pricing = await clientPricing()
  try {
    const user = await currentUser()
    if (!user) return { user: null, credits: null, pricing }
    if (isSupabaseBackend()) {
      const connection = await connectionStatus()
      return {
        user: {
          id: user.id,
          role: user.role,
          email: user.email,
          name: user.name,
          apiKeyConnected: connection.connected,
        },
        credits: null,
        pricing,
      }
    }
    const balance = await getBalance(user.objectId)
    return {
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
      },
      credits: balance.total,
      pricing,
    }
  } catch (error) {
    // Let Next's own control-flow errors (dynamic rendering, redirects) through.
    unstable_rethrow(error)
    console.error(
      "[layout] session unavailable",
      error instanceof Error ? error.message : error
    )
    return { user: null, credits: null, pricing }
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, credits, pricing } = await bootstrap()
  return (
    <html
      lang="en"
      data-theme="default-dark"
      className={cn(
        "dark font-sans antialiased",
        spaceGrotesk.variable,
        inter.variable,
        plexMono.variable
      )}
    >
      <body className="min-h-dvh bg-page text-foreground">
        <a
          href="#main"
          className="sr-only z-[100] rounded-lg bg-lime px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <AppProviders user={user} initialCredits={credits} pricing={pricing}>
          {children}
          <AuthModal />
          <UpgradeModal />
          <CookieConsent />
        </AppProviders>
      </body>
    </html>
  )
}
