import { PromoBar } from "@/components/site/promo-bar"
import { TopNav } from "@/components/site/top-nav"

/** App pages: compact nav and a full-height workspace (no footer, no page scroll). */
export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-dvh w-full max-w-full min-w-0 flex-col overflow-hidden">
      <PromoBar />
      <TopNav compact />
      <main
        id="main"
        className="flex min-h-0 max-w-full min-w-0 flex-1 flex-col"
      >
        {children}
      </main>
    </div>
  )
}
