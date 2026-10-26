"use client"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Heart, ImageIcon, Share2 } from "lucide-react"
import { ShareSheet } from "@/components/share-sheet"
import { SITE_URL } from "@/lib/share"
import { getToken } from "@/lib/api"
import { addWishlist, removeWishlist, listingPrice, inventoryLabel, type MarketListing } from "@/lib/marketplace"

export function ListingCard({ listing, saved, onRemoved, onOpen }: { listing: MarketListing; saved?: boolean; onRemoved?: () => void; onOpen?: () => void }) {
  const router = useRouter()
  const [optimistic, setSaved] = useState<boolean | null>(null)
  const isSaved = optimistic ?? saved ?? listing.is_wishlisted ?? false
  const [sharing, setSharing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [broken, setBroken] = useState(false)
  const media = listing.media.find(m => m.slot_key === 'front') || listing.media[0]
  const image = media?.image || media?.external_url
  const book = listing.viewer?.mode === "book_3d"
  const status = listing.inventory_summary ? inventoryLabel(listing.inventory_summary) : { label: 'Available' }
  async function toggle() {
    if (!getToken()) { router.push(`/login/?next=${encodeURIComponent('/wishlist/')}&wishlist=${listing.id}`); return }
    const previous = isSaved
    setSaved(!previous); setBusy(true); setError("")
    try { if (previous) { await removeWishlist(listing.id); onRemoved?.() } else await addWishlist(listing.id) }
    catch (e) { setSaved(previous); setError(e instanceof Error ? e.message : "Could not update Wishlist.") }
    finally { setBusy(false) }
  }
  return <article className="group relative flex min-w-0 flex-col rounded-3xl border border-border bg-card text-card-foreground shadow-sm motion-safe:transition-shadow hover:shadow-lg">
    <a href={listing.url || `/listings/${listing.slug}/`} onClick={onOpen ? e => { e.preventDefault(); onOpen() } : undefined} className="block rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-t-3xl bg-muted/40 p-6 [perspective:900px]">
        {image && !broken ? <img loading="lazy" src={image} onError={() => setBroken(true)} alt={media.alt_text || listing.title} className={`h-full max-h-56 w-full object-contain drop-shadow-xl motion-safe:transition-transform motion-safe:duration-300 ${book ? 'max-w-[70%] [transform:rotateY(-14deg)_rotateZ(-3deg)] group-hover:[transform:rotateY(-6deg)]' : 'motion-safe:[transform:rotateY(-7deg)_rotateZ(-2deg)] motion-safe:group-hover:[transform:rotateY(0deg)_scale(1.03)]'} motion-reduce:transform-none`} /> : <ImageIcon aria-label="Image unavailable" className="size-12 text-muted-foreground" />}
      </div>
      <div className="p-5 pb-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{listing.fulfillment_type.replaceAll('_', ' ')}</p><h2 className="mt-2 line-clamp-2 text-lg font-bold">{listing.title}</h2><p className="mt-3 text-xl font-bold">{listingPrice(listing)}</p><p className="mt-1 text-sm text-muted-foreground">{listing.is_demo ? 'DEMO / NOT FOR SALE' : status.label}</p></div>
    </a>
    <div className="mt-auto flex items-center justify-between gap-2 px-5 pb-4"><div className="min-w-0 text-sm text-muted-foreground">Sold by {listing.seller.slug ? <a href={`/sellers/${listing.seller.slug}/`} className="truncate hover:underline">{listing.seller.display_name || listing.seller.name}</a> : listing.seller.name}{listing.seller.identity_verified && <span className="ml-1 text-[var(--brand-pink-text)]" aria-label="Identity Verified">✓</span>}</div>{!listing.is_demo && <button disabled={busy} onClick={() => void toggle()} aria-label={`${isSaved ? 'Remove' : 'Save'} ${listing.title} ${isSaved ? 'from' : 'to'} Wishlist`} aria-pressed={isSaved} className="grid size-11 shrink-0 place-items-center rounded-full border hover:bg-accent focus-visible:outline focus-visible:outline-primary disabled:opacity-50"><Heart className={`size-5 ${isSaved ? 'fill-[var(--brand-pink)] text-[var(--brand-pink-text)]' : ''}`} /></button>}</div>
    <button type="button" onClick={() => setSharing(true)} aria-label={`Share ${listing.title}`} className="mx-5 mb-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm"><Share2 className="size-4" />Share</button>
    <ShareSheet kind={book ? "book" : "listing"} book={{ id: listing.id, title: listing.title, shareUrl: new URL(listing.url || `/listings/${listing.slug}/`, SITE_URL).href }} open={sharing} onClose={() => setSharing(false)} />
    {error && <p role="alert" className="px-5 pb-4 text-sm text-destructive">{error}</p>}
  </article>
}
