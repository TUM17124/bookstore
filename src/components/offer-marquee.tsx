"use client"

import { useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Pause, Play } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { useSiteConfig } from "@/lib/site-config"

/** The scrolling strip under the navbar. Admin-editable: Django admin →
 * Site: General → "Scrolling strip under the navbar", one item per line
 * (Part D). The built-in list lives in site-defaults.json. */
export function OfferMarquee() {
  const path = usePathname()
  const categoryQuery = useSearchParams().get("category") || ""
  const placement = announcementPlacement(path)
  const [config] = useSiteConfig()
  const [items, setItems] = useState<Announcement[]>([])
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (!placement) return
    const controller = new AbortController()
    const query = new URLSearchParams({ placement })
    const category = categoryQuery || (placement === "category" ? path.split("/")[2] : "")
    if (category) query.set("category", category)
    async function refresh() {
      try {
        const response = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/site/announcements/?${query}`, { signal: controller.signal })
        if (!response.ok) throw new Error("Announcements unavailable")
        const data = await response.json()
        if (!controller.signal.aborted) setItems(data.items || [])
      } catch { if (!controller.signal.aborted) setItems([]) }
    }
    void refresh()
    const timer = setInterval(() => { if (!document.hidden) void refresh() }, 60_000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [path, placement, categoryQuery])
  if (!placement || !items.length) return null

  return (
    <div
      className="relative overflow-hidden border-b border-foreground/10 bg-foreground/[0.04]"
      aria-label="Marketplace announcements"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent" />

      <div className="group flex items-center gap-3 px-4">
        <span className="shrink-0 font-bold">{config?.site?.name}</span>
        <div className="min-w-0 flex-1 overflow-hidden"><div className="flex w-max gap-8 py-2.5 motion-safe:animate-marquee-left group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] motion-reduce:w-auto motion-reduce:flex-wrap" style={{ animationPlayState: paused ? "paused" : undefined }}>
          {items.map(item => <span key={item.id} className="shrink-0 text-sm">{item.url && (item.url.startsWith('/') && !item.url.startsWith('//') || item.url.startsWith('https://')) ? <a className="underline-offset-4 hover:underline focus-visible:outline" href={item.url}>{item.text}</a> : item.text}</span>)}
        </div></div>
        <button type="button" onClick={() => setPaused(v => !v)} aria-label={paused ? "Play announcements" : "Pause announcements"} className="z-20 grid size-9 shrink-0 place-items-center rounded-full border motion-reduce:hidden">{paused ? <Play size={14} /> : <Pause size={14} />}</button>
      </div>
    </div>
  )
}

type Announcement = { id: number; text: string; url: string; ends_at: string | null }
export function announcementPlacement(path: string): string | null {
  if (path === "/") return "home"
  const first = path.split("/").filter(Boolean)[0]
  return ({ marketplace: "marketplace", books: "books", categories: "category", listings: "listing", b: "books", sellers: "seller", auctions: "auctions", wishlist: "wishlist" } as Record<string, string>)[first] || null
}
