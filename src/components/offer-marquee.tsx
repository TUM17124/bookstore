"use client"

import { useList } from "@/lib/site-config"

/** The scrolling strip under the navbar. Admin-editable: Django admin →
 * Site: General → "Scrolling strip under the navbar", one item per line
 * (Part D). The built-in list lives in site-defaults.json. */
export function OfferMarquee() {
  const line = useList("marquee.items").join("  ·  ")

  return (
    <div
      className="relative overflow-hidden border-b border-foreground/10 bg-foreground/[0.04]"
      aria-label="What PlugYard offers"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent" />

      <div className="flex w-max animate-marquee-left py-2.5">
        {[0, 1].map((i) => (
          <p
            key={i}
            className="shrink-0 px-6 text-[13px] font-semibold tracking-wide text-foreground/80 whitespace-nowrap"
          >
            <span className="mr-3 font-bold text-foreground">PlugYard</span>
            {line}
            <span className="mx-8 text-foreground/25">·</span>
          </p>
        ))}
      </div>
    </div>
  )
}