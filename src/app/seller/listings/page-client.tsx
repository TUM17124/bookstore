"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { archiveMyListing, confirmSellerAvailability, deleteMyListing, listingPrice, marketCategories, myListings, replaceListingMedia, restoreMyListing, updateMyListing, type MarketCategory, type MarketListing } from "@/lib/marketplace"

type EditForm = { title: string; description: string; category: string; price_type: string; price_amount: string; price_min: string; price_max: string }
const emptyForm: EditForm = { title: "", description: "", category: "", price_type: "fixed", price_amount: "", price_min: "", price_max: "" }

export default function SellerListings({ embedded = false, kind = "all" }: { embedded?: boolean; kind?: "all" | "product" | "service" }) {
  const [rows, setRows] = useState<MarketListing[]>([])
  const [categories, setCategories] = useState<MarketCategory[]>([])
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [editing, setEditing] = useState<number | null>(null)
  const [form, setForm] = useState<EditForm>(emptyForm)
  const [busy, setBusy] = useState(false)
  const load = () => myListings().then((page) => setRows(page.results)).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load listings."))
  useEffect(() => { void load(); marketCategories().then(setCategories).catch(() => setCategories([])) }, [])
  const selectedListing = rows.find((row) => row.id === editing)
  const visibleRows = rows.filter((row) => {
    if (row.legacy_book_id || row.viewer?.mode === "book_3d") return false
    if (kind === "all") return true
    const category = categories.find((item) => item.slug === row.category)
    if (!category) return false
    return (category.fulfillment_type === "service") === (kind === "service")
  })
  const allowedCategories = useMemo(() => {
    if (!selectedListing) return []
    const current = categories.find((category) => category.slug === selectedListing.category)
    if (!current) return []
    const keys = (category: MarketCategory) => category.attributes.map((item) => item.key).sort().join("|")
    const slots = (category: MarketCategory) => category.media_slots.map((item) => item.key).sort().join("|")
    return categories.filter((category) => category.fulfillment_type === current.fulfillment_type && category.inventory_policy === current.inventory_policy && category.variants_enabled === current.variants_enabled && keys(category) === keys(current) && slots(category) === slots(current))
  }, [categories, selectedListing])
  function beginEdit(listing: MarketListing) {
    setEditing(listing.id)
    setForm({ title: listing.title, description: listing.description_text || "", category: listing.category, price_type: listing.price_type, price_amount: listing.price_amount || "", price_min: listing.price_min || "", price_max: listing.price_max || "" })
    setNotice(""); setError("")
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing) return
    setBusy(true); setError(""); setNotice("")
    try {
      const result = await updateMyListing(editing, {
        title: form.title.trim(), category: form.category,
        description: { type: "doc", content: form.description.trim() ? [{ type: "paragraph", content: [{ type: "text", text: form.description.trim() }] }] : [] },
        price_type: form.price_type,
        price_amount: form.price_type === "fixed" ? form.price_amount : null,
        price_min: form.price_type === "range" ? form.price_min : null,
        price_max: form.price_type === "range" ? form.price_max : null,
      })
      setRows((items) => items.map((item) => item.id === result.id ? result : item))
      setNotice("Listing changes saved."); setEditing(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the listing. Review the fields and try again.") }
    finally { setBusy(false) }
  }
  async function archive(listing: MarketListing) {
    if (!window.confirm(`Archive “${listing.title}”? Existing orders and buyer access will be retained.`)) return
    setError(""); setNotice("")
    try { const updated = await archiveMyListing(listing.id); setRows((items) => items.map((item) => item.id === listing.id ? updated : item)); setNotice("Listing archived. It is no longer publicly available; order history is preserved.") }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not archive this listing.") }
  }
  async function restore(listing: MarketListing) {
    setError(""); setNotice("")
    try { const updated = await restoreMyListing(listing.id); setRows((items) => items.map((item) => item.id === listing.id ? updated : item)); setNotice("Listing restored as a draft and sent for review before it can become public.") }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not restore this listing.") }
  }
  async function confirmAvailability(listing: MarketListing) {
    if (!window.confirm(`Confirm that “${listing.title}” is still available, its price is current, and its stock and fulfilment details are accurate? It may require review before customers can see it.`)) return
    setBusy(true); setError(""); setNotice("")
    try {
      const result = await confirmSellerAvailability([listing.id])
      await load()
      if (!result.restored.includes(listing.id)) {
        setError(result.skipped_reasons[String(listing.id)] || result.message || "This listing needs valid inventory before it can be restored. Update stock and try again.")
      } else {
        setNotice(result.requires_moderation ? "Availability confirmed. The listing is restored and awaiting administrator review before it can become public." : "Availability confirmed. The listing is restored.")
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not confirm availability.") }
    finally { setBusy(false) }
  }
  async function remove(listing: MarketListing) {
    if (!window.confirm(`Permanently delete “${listing.title}”? This removes the listing and its unused images. Listings with orders, bids, offers, or retained stock records cannot be deleted; archive those instead.`)) return
    setError(""); setNotice("")
    try { await deleteMyListing(listing.id); setRows((items) => items.filter((item) => item.id !== listing.id)); if (editing === listing.id) setEditing(null); setNotice("Listing deleted.") }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete this listing.") }
  }
  async function changeImage(listing: MarketListing, mediaId: number, file?: File) {
    if (!file) return
    setError(""); setNotice("")
    try { const media = await replaceListingMedia(listing.id, mediaId, file); setRows((items) => items.map((item) => item.id === listing.id ? { ...item, media: item.media.map((entry) => entry.id === mediaId ? media : entry) } : item)); setNotice("Listing image updated.") }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update this image.") }
  }
  const content = <>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-semibold text-[var(--brand-pink-text)]">Seller dashboard</p><h2 className="text-3xl font-black">{kind === "service" ? "Services" : kind === "product" ? "Products" : "Products and services"}</h2><p className="mt-1 text-sm text-muted-foreground">Edit prices and details, manage stock, archive listings, or permanently delete eligible listings. Transaction history is retained.</p></div><div className="flex flex-wrap gap-2"><Link href="/seller/orders" className="rounded-full border border-border px-4 py-2 font-bold text-[var(--brand-pink-text)]">Orders &amp; earnings</Link><Link href="/auctions?mine=1" className="rounded-full border border-border px-4 py-2 font-bold text-[var(--brand-pink-text)]">My Auctions</Link><Link href="/sell" className="rounded-full bg-pink-600 px-4 py-2 font-bold text-white">Create listing</Link></div></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}{notice && <p role="status" className="rounded-xl bg-muted p-3 text-sm">{notice}</p>}
    <div className="grid gap-5 sm:grid-cols-2">{visibleRows.map((listing) => <article key={listing.id} className="rounded-3xl border bg-card p-5 shadow-sm"><div className="flex gap-4">{listing.media[0] && <img src={listing.media[0].image || listing.media[0].external_url} alt="" className="h-24 w-24 rounded-xl object-cover" />}<div className="min-w-0"><h3 className="text-xl font-black">{listing.title}</h3><p>{listingPrice(listing)}</p><p className="mt-1 text-sm capitalize text-muted-foreground">{listing.inactive_paused_at ? "Hidden due to seller inactivity" : `${listing.status} · ${listing.moderation_status}`}</p>{listing.inactive_paused_at && <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">{listing.inactive_pause_reason || "Confirm this listing’s availability to make it eligible for restoration."}</p>}</div></div>
      {editing === listing.id ? <form className="mt-5 space-y-3 border-t pt-4" onSubmit={save}><label className="block text-sm font-semibold">Title<input required maxLength={240} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label><label className="block text-sm font-semibold">Description<textarea rows={5} maxLength={12000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-xl border bg-background p-3" /></label><label className="block text-sm font-semibold">Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">{(allowedCategories.length ? allowedCategories : [{ slug: listing.category, label: listing.category } as MarketCategory]).map((category) => <option key={category.slug} value={category.slug}>{category.label}</option>)}</select><span className="mt-1 block text-xs font-normal text-muted-foreground">Only categories with compatible fulfillment, stock, variant and attribute requirements are selectable.</span></label><label className="block text-sm font-semibold">Price type<select value={form.price_type} onChange={(e) => setForm({ ...form, price_type: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"><option value="fixed">Fixed price</option><option value="range">Price range</option><option value="free">Free</option></select></label>{form.price_type === "fixed" && <label className="block text-sm font-semibold">Price ({listing.currency})<input required type="number" min="0" step="0.01" value={form.price_amount} onChange={(e) => setForm({ ...form, price_amount: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label>}{form.price_type === "range" && <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Minimum<input required type="number" min="0" step="0.01" value={form.price_min} onChange={(e) => setForm({ ...form, price_min: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label><label className="text-sm font-semibold">Maximum<input required type="number" min="0" step="0.01" value={form.price_max} onChange={(e) => setForm({ ...form, price_max: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3" /></label></div>}<div className="flex flex-wrap gap-2"><button disabled={busy} className="min-h-11 rounded-full bg-pink-600 px-5 font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button><button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-full border px-5 font-bold">Cancel</button></div></form> : <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => beginEdit(listing)} className="min-h-10 rounded-full border px-4 text-sm font-bold">Edit listing</button>{listing.inactive_paused_at && listing.status === "archived" ? <button type="button" onClick={() => void restore(listing)} className="min-h-10 rounded-full border px-4 text-sm font-bold">Restore as draft first</button> : listing.inactive_paused_at ? <><button type="button" disabled={busy} onClick={() => void confirmAvailability(listing)} className="min-h-10 rounded-full bg-pink-600 px-4 text-sm font-bold text-white disabled:opacity-50">Confirm availability &amp; restore</button><Link href={`/seller/inventory?listing=${listing.id}`} className="min-h-10 rounded-full border px-4 py-2 text-sm font-bold">Update stock first</Link></> : listing.status === "archived" ? <button type="button" onClick={() => void restore(listing)} className="min-h-10 rounded-full border px-4 text-sm font-bold">Restore as draft</button> : <button type="button" onClick={() => void archive(listing)} className="min-h-10 rounded-full border border-destructive/40 px-4 text-sm font-bold text-destructive">Archive</button>}<button type="button" onClick={() => void remove(listing)} className="min-h-10 rounded-full border border-destructive/40 px-4 text-sm font-bold text-destructive">Delete</button><Link href={`/seller/inventory?listing=${listing.id}`} className="min-h-10 rounded-full border px-4 py-2 text-sm font-bold">Manage stock</Link>{listing.status === "active" && listing.moderation_status === "approved" && !listing.inactive_paused_at && <Link href="/advertise" className="min-h-10 rounded-full bg-pink-600 px-4 py-2 text-sm font-bold text-white">Promote</Link>}{listing.status === "active" && listing.moderation_status === "approved" && !listing.inactive_paused_at && <a href={`/listings/${listing.slug}/`} className="min-h-10 rounded-full border px-4 py-2 text-sm font-bold">Public page</a>}</div>}
      {listing.media.length > 0 && <details className="mt-4 border-t pt-3"><summary className="cursor-pointer text-sm font-semibold">Update product images</summary><div className="mt-3 space-y-3">{listing.media.map((media) => <label key={media.id} className="flex flex-wrap items-center gap-3 text-sm">{media.slot_label || "Listing image"}<input type="file" accept="image/*" onChange={(e) => void changeImage(listing, media.id, e.target.files?.[0])} className="min-w-0 max-w-full" /></label>)}</div></details>}</article>)}{!visibleRows.length && !error && <div className="rounded-2xl border border-dashed p-10 text-center sm:col-span-2">No {kind === "service" ? "services" : kind === "product" ? "products" : "marketplace listings"} in this section.</div>}</div>
  </>
  return embedded ? <section className="space-y-5">{content}</section> : <main className="mx-auto max-w-5xl space-y-5 px-4 py-10">{content}</main>
}
