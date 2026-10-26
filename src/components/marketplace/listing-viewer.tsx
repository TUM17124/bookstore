"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { completeSurfaces } from "./surfaces"
import type { MarketListing } from "@/lib/marketplace"

const Turntable = dynamic(() => import('./turntable'), { ssr: false })
const BookViewer = dynamic(() => import('./book-viewer'), { ssr: false })

const src = (item: MarketListing["media"][number]) => item.image || item.external_url

export function ListingViewer({ listing }: { listing: MarketListing }) {
  const [active, setActive] = useState(0)
  const [mode, setMode] = useState<'gallery' | '3d'>('3d')
  const media = listing.media.filter((item) => src(item))
  const canRotate = listing.viewer.mode === 'turntable' && completeSurfaces(media)
  const canRead = listing.viewer.mode === 'book_3d' && !!listing.legacy_book_id
  if (mode === '3d' && (canRotate || canRead)) return <div><button type="button" className="mb-3 min-h-11 rounded-full border px-4" onClick={() => setMode('gallery')}>Switch to image gallery</button>{canRead ? <BookViewer id={listing.legacy_book_id!} /> : <Turntable media={media} />}</div>
  if (!media.length) return <div className="grid aspect-square place-items-center rounded-3xl bg-muted text-muted-foreground">No image yet</div>
  const selected = media[Math.min(active, media.length - 1)]
  return <div className="space-y-3">{(canRotate || canRead) && <button type="button" className="min-h-11 rounded-full border px-4" onClick={() => setMode('3d')}>Open 3D viewer</button>}<div className="aspect-square overflow-hidden rounded-3xl bg-muted"><img src={src(selected)} alt={selected.alt_text || selected.slot_label} className="h-full w-full object-contain" /></div><div className="flex gap-2 overflow-x-auto">{media.map((item, index) => <button key={item.id} onClick={() => setActive(index)} aria-pressed={active === index} aria-label={`Show ${item.slot_label}`} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${active === index ? "border-primary" : "border-transparent"}`}><img src={src(item)} alt="" className="h-full w-full object-cover" /></button>)}</div></div>
}
