"use client"

import Link from "next/link"

import { BRAND } from "@/lib/brand"

import { LogoMark } from "./logo"

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Create",
    links: [
      { label: "Image", href: "/image" },
      { label: "Video", href: "/video" },
      { label: "Edit video", href: "/video?tab=edit" },
      { label: "Motion control", href: "/video?tab=motion" },
      { label: "Effects", href: "/effects" },
    ],
  },
  {
    title: "Video models",
    links: [
      { label: "Seedance 2.5", href: "/video?model=seedance-2.5" },
      { label: "Kling 3.0", href: "/video?model=kling-3-std" },
      { label: "Wan 3.0", href: "/video?model=wan-3" },
      { label: "Cinema Studio 4.0", href: "/video?model=cinema-studio-4" },
      { label: "MiniMax H3", href: "/video?model=minimax-h3" },
    ],
  },
  {
    title: "Image models",
    links: [
      { label: "Soul 2", href: "/image?model=soul-2" },
      { label: "Soul Cinema", href: "/image?model=soul-cinema" },
      { label: "Grok Image 2.0", href: "/image?model=grok-image-2" },
      { label: "Ideogram 4.0", href: "/image?model=ideogram-4" },
      { label: "Recraft V4.1", href: "/image?model=recraft-4.1" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Templates", href: "/templates" },
      ...(BRAND.supportEmail
        ? [{ label: "Support", href: `mailto:${BRAND.supportEmail}` }]
        : []),
      { label: "Terms", href: "/legal/terms" },
      { label: "Privacy", href: "/legal/privacy" },
    ],
  },
]

export function Footer() {
  return (
    <footer className="mt-24">
      <div className="bg-brix-second px-6 py-14 text-white md:px-12">
        <div className="mx-auto grid max-w-[1400px] gap-12 lg:grid-cols-[1.1fr_2fr]">
          <div className="flex flex-col gap-6">
            <LogoMark className="size-10 [&_circle]:fill-[#006494] [&_path]:fill-[#006494] [&_rect]:fill-[#ffffff]" />
            <p className="font-display text-4xl leading-[0.95] md:text-5xl">
              Direct every
              <br />
              frame yourself
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <div key={column.title} className="flex flex-col gap-3">
                <p className="text-sm font-medium text-white">{column.title}</p>
                {column.links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-[15px] font-medium hover:underline hover:underline-offset-4"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start justify-between gap-3 px-6 py-5 text-sm text-muted-foreground md:flex-row md:items-center md:px-12">
        <p>
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </p>
        <div className="flex flex-wrap gap-4 text-foreground">
          <Link href="/legal/terms" className="hover:text-lime">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-lime">
            Privacy
          </Link>
          <Link href="/legal/acceptable-use" className="hover:text-lime">
            Acceptable use
          </Link>
          <button
            type="button"
            className="hover:text-lime"
            onClick={() =>
              window.dispatchEvent(new Event("vireo:cookie-preferences"))
            }
          >
            Cookie settings
          </button>
        </div>
      </div>
    </footer>
  )
}
