"use client"

import { useState } from "react"
import type { MarketListing } from "@/lib/marketplace"

const src = (item: MarketListing["media"][number]) => item.image || item.external_url

export function ListingViewer({ listing }: { listing: MarketListing }) {
  const [active, setActive] = useState(0)
  const media = listing.media.filter((item) => src(item))
  if (!media.length) return <div className="grid aspect-square place-items-center rounded-3xl bg-pink-50 text-pink-900/50">No image yet</div>
  if (listing.viewer.mode === "turntable" && media.length >= 4) {
    return <div className="space-y-3"><div className="perspective-[1000px] grid aspect-square place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-pink-50 to-white">
      <div className="relative h-3/5 w-3/5 transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: `rotateY(${-active * (360 / media.length)}deg)` }}>
        {media.map((item, index) => <img key={item.id} src={src(item)} alt={item.alt_text || item.slot_label} className="absolute inset-0 h-full w-full rounded-xl object-contain shadow-xl [backface-visibility:hidden]" style={{ transform: `rotateY(${index * (360 / media.length)}deg) translateZ(150px)` }} />)}
      </div></div><div className="flex gap-2 overflow-x-auto">{media.map((item, index) => <button key={item.id} onClick={() => setActive(index)} className={`shrink-0 rounded-full px-3 py-1 text-sm ${active === index ? "bg-pink-600 text-white" : "bg-pink-50"}`}>{item.slot_label}</button>)}</div></div>
  }
  return <div className="space-y-3"><div className="aspect-square overflow-hidden rounded-3xl bg-pink-50"><img src={src(media[active])} alt={media[active].alt_text || media[active].slot_label} className="h-full w-full object-contain" /></div><div className="flex gap-2 overflow-x-auto">{media.map((item, index) => <button key={item.id} onClick={() => setActive(index)} aria-label={`Show ${item.slot_label}`} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${active === index ? "border-pink-600" : "border-transparent"}`}><img src={src(item)} alt="" className="h-full w-full object-cover" /></button>)}</div></div>
}
