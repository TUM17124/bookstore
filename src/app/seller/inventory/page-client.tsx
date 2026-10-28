"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { confirmSellerAvailability, listingInventory, listingPrice, myListings, updateListingInventory, type InventoryRow, type MarketListing } from "@/lib/marketplace"

export default function InventoryClient({ embedded = false }: { embedded?: boolean }) {
  const [listings, setListings] = useState<MarketListing[]>([])
  const [selected, setSelected] = useState<MarketListing | null>(null)
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [notice, setNotice] = useState("")
  const [reactivating, setReactivating] = useState(false)
  const load = () => myListings().then((page) => {
    const inventoryListings = page.results.filter((listing) => !listing.legacy_book_id && listing.viewer?.mode !== "book_3d")
    setListings(inventoryListings)
    return inventoryListings
  }).catch((reason) => {
    const message = reason instanceof Error ? reason.message : "Could not load inventory."
    setNotice(message)
    throw reason
  })
  useEffect(() => { void load().then((rows) => { const id = new URLSearchParams(window.location.search).get("listing"); const target = rows.find((row) => String(row.id) === id); if (target) void choose(target) }).catch(() => undefined) }, [])
  async function choose(listing: MarketListing) {
    setSelected(listing); setNotice("")
    try { setRows((await listingInventory(listing.id)).rows) }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not load inventory.") }
  }
  async function save(row: InventoryRow, total: number) {
    if (!selected) return
    try {
      const updated = await updateListingInventory(selected.id, { variant: row.variant_id || undefined, total_quantity: total, low_stock_threshold: row.low_stock_threshold, reason: "Seller dashboard stock confirmation" })
      setRows((values) => values.map((value) => value.id === row.id ? updated : value)); setNotice("Stock updated.")
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not update stock.") }
  }
  async function reactivate() {
    if (!selected) return
    setReactivating(true)
    setNotice("")
    try {
      const result = await confirmSellerAvailability([selected.id])
      if (!result.restored.includes(selected.id)) {
        setNotice(result.skipped_reasons[String(selected.id)] || result.message || "This listing could not be restored. Review its stock and moderation status.")
        return
      }
      let refreshed: MarketListing[]
      try { refreshed = await load() }
      catch {
        setNotice("Availability was confirmed, but the dashboard could not refresh. Reload the page to verify its current status.")
        return
      }
      const updated = refreshed.find((listing) => listing.id === selected.id)
      if (updated) setSelected(updated)
      setNotice(result.requires_moderation
        ? "Availability confirmed. The listing is restored and awaiting administrator review before publication."
        : "Availability confirmed. The listing is restored.")
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not confirm availability.") }
    finally { setReactivating(false) }
  }
  return <section className={embedded ? "space-y-6" : "mx-auto max-w-5xl px-4 py-10"}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-[var(--brand-pink-text)]">Seller dashboard</p>{embedded ? <h2 className="text-3xl font-black">Inventory</h2> : <h1 className="text-4xl font-black">Inventory</h1>}<p className="mt-2 text-muted-foreground">Available stock excludes units reserved by active checkouts and auctions.</p></div>{!embedded && <Link href="/dashboard?tab=inventory" className="rounded-full border border-border px-5 py-3 font-bold text-[var(--brand-pink-text)]">Back to Seller Dashboard</Link>}</div><div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"><section className="space-y-3">{listings.map((listing) => <button type="button" key={listing.id} onClick={() => void choose(listing)} className={`w-full rounded-2xl border p-4 text-left ${selected?.id === listing.id ? "border-pink-500 bg-muted" : "border-border"}`}><span className="block font-black">{listing.title}</span><span className="text-sm">{listingPrice(listing)}</span>{listing.inactive_paused_at && <span className="mt-1 block text-sm font-semibold text-warning">Paused for availability confirmation</span>}</button>)}</section><section className="rounded-3xl border border-border p-5">{!selected ? <p>Select a listing to manage stock.</p> : <><h3 className="text-2xl font-black">{selected.title}</h3>{selected.inactive_paused_at && <button type="button" disabled={reactivating} onClick={() => void reactivate()} className="mt-4 min-h-11 rounded-full bg-pink-600 px-5 font-bold text-white disabled:opacity-50">{reactivating ? "Confirming…" : "Confirm inventory and reactivate"}</button>}<div className="mt-5 space-y-3">{rows.map((row) => <InventoryEditor key={row.id} row={row} save={save} />)}{!rows.length && <p className="rounded-xl bg-muted p-4 text-sm">This listing does not use finite stock tracking.</p>}</div></>}{notice && <p role="status" className="mt-4 rounded-xl bg-muted p-3 text-sm">{notice}</p>}</section></div></section>
}

function InventoryEditor({ row, save }: { row: InventoryRow; save: (row: InventoryRow, total: number) => Promise<void> }) {
  const [total, setTotal] = useState(row.total_quantity)
  return <div className="rounded-2xl border p-4"><p className="font-semibold">{row.variant_id ? row.variant_name || `Variant #${row.variant_id}` : "Listing stock"}{row.variant_sku && <span className="ml-2 text-xs font-normal text-muted-foreground">SKU {row.variant_sku}</span>}</p><p className="mt-1 text-sm text-muted-foreground">Available {row.available_quantity ?? "unlimited"} · Reserved {row.reserved_quantity} · Sold {row.sold_quantity}</p><div className="mt-3 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Total physical stock<input type="number" min={row.reserved_quantity + row.sold_quantity} step="1" value={total} onChange={(event) => setTotal(Number(event.target.value))} className="mt-1 block w-32 rounded-xl border p-2" /></label><button type="button" onClick={() => void save(row, total)} className="min-h-11 rounded-full bg-pink-600 px-5 font-bold text-white">Save stock</button></div></div>
}
