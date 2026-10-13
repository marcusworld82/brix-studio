import { activeSurfaces } from "@/generation/catalog"

export type NavLink = {
  href: string
  label: string
  match: (path: string) => boolean
}

/** Top navigation, in site order. Audio appears once an audio model exists. */
export function navLinks(): NavLink[] {
  const surfaces = activeSurfaces()
  const links: NavLink[] = [
    { href: "/", label: "Explore", match: (path) => path === "/" },
    {
      href: "/image",
      label: "Image",
      match: (path) => path.startsWith("/image"),
    },
    {
      href: "/video",
      label: "Video",
      match: (path) => path.startsWith("/video"),
    },
  ]
  if (surfaces.includes("audio"))
    links.push({
      href: "/audio",
      label: "Audio",
      match: (path) => path.startsWith("/audio"),
    })
  links.push(
    {
      href: "/effects",
      label: "Effects",
      match: (path) => path.startsWith("/effects"),
    },
    {
      href: "/templates",
      label: "Templates",
      match: (path) => path.startsWith("/templates"),
    },
    {
      href: "/pricing",
      label: "Pricing",
      match: (path) => path.startsWith("/pricing"),
    }
  )
  return links
}
