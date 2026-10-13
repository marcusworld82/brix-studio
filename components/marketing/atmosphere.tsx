import { cn } from "@/lib/utils"

/**
 * The studio's backdrop: a soft blue radial glow plus a full dot field
 * (same recipe as ScreenEmptyState). Purely decorative.
 */
export function Atmosphere({
  className,
  glow = "top",
}: {
  className?: string
  glow?: "top" | "bottom" | "center"
}) {
  const at =
    glow === "top" ? "50% 0%" : glow === "bottom" ? "50% 100%" : "50% 50%"
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(60% 55% at ${at}, rgba(5,130,202,0.16) 0%, rgba(5,130,202,0.05) 45%, transparent 75%)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(151,157,172,0.16) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
    </div>
  )
}
