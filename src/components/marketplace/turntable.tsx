"use client"
import { useRef, useState } from "react"
import type { ListingMedia } from "@/lib/marketplace"

import { SIDES } from "./surfaces"
const angles = { front: [0, 0], back: [0, 180], left: [0, 90], right: [0, -90], top: [90, 0], bottom: [-90, 0] }
export default function Turntable({ media }: { media: ListingMedia[] }) {
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [rotation, setRotation] = useState([-14, -25])
  const [zoom, setZoom] = useState(1)
  const [notice, setNotice] = useState('')
  const size = 180
  const transforms = { front: `translateZ(${size / 2}px)`, back: `rotateY(180deg) translateZ(${size / 2}px)`, left: `rotateY(-90deg) translateZ(${size / 2}px)`, right: `rotateY(90deg) translateZ(${size / 2}px)`, top: `rotateX(90deg) translateZ(${size / 2}px)`, bottom: `rotateX(-90deg) translateZ(${size / 2}px)` }
  return <div ref={root} className="space-y-4 rounded-3xl bg-card p-3 text-card-foreground">
    <div role="group" tabIndex={0} aria-label="3D product viewer. Drag to rotate, or use the arrow keys. Use plus and minus to zoom."
      className="grid min-h-80 touch-none place-items-center overflow-hidden rounded-2xl bg-muted/40 [perspective:850px] focus-visible:outline focus-visible:outline-primary"
      onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={e => { if (!drag.current) return; const dx = e.clientX - drag.current.x; const dy = e.clientY - drag.current.y; setRotation(([x, y]) => [x - dy * .5, y + dx * .5]); drag.current = { x: e.clientX, y: e.clientY } }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
      onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-'].includes(e.key)) e.preventDefault(); if (e.key === 'ArrowLeft') setRotation(([x,y]) => [x,y-15]); if(e.key === 'ArrowRight') setRotation(([x,y]) => [x,y+15]); if(e.key === 'ArrowUp') setRotation(([x,y]) => [x-15,y]); if(e.key === 'ArrowDown') setRotation(([x,y]) => [x+15,y]); if(e.key === '+') setZoom(v => Math.min(1.8,v+.1)); if(e.key === '-') setZoom(v => Math.max(.5,v-.1)) }}>
      <div className="relative [transform-style:preserve-3d]" style={{ width: size, height: size, transform: `scale(${zoom}) rotateX(${rotation[0]}deg) rotateY(${rotation[1]}deg)` }}>
        {SIDES.map(side => { const m = media.find(item => (item.surface || item.slot_key) === side)!; return <img key={side} src={m.image || m.external_url} alt={m.alt_text || m.slot_label} draggable={false} className="absolute inset-0 h-full w-full border border-border bg-card object-contain [backface-visibility:hidden]" style={{ transform: transforms[side] }} /> })}
      </div>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Choose product side">{SIDES.map(side => <button key={side} type="button" className="min-h-11 rounded-full border px-3 capitalize hover:bg-accent" onClick={() => setRotation(angles[side])}>{media.find(m => (m.surface || m.slot_key) === side)?.slot_label || side}</button>)}</div>
    <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-sm">Zoom<input aria-label="Product zoom" type="range" min="0.5" max="1.8" step="0.1" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label><button type="button" className="min-h-11 rounded-full border px-4" onClick={() => { setRotation([-14,-25]); setZoom(1) }}>Reset view</button><button type="button" className="min-h-11 rounded-full border px-4" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else if(root.current?.requestFullscreen) void root.current.requestFullscreen().catch(() => setNotice('Full screen is unavailable in this browser.')); else setNotice('Full screen is unavailable in this browser.') }}>Full screen</button></div>
    <p className="text-xs text-muted-foreground">Photographs mapped to six faces. Shape and proportions are illustrative.</p>{notice && <p role="status">{notice}</p>}
  </div>
}
