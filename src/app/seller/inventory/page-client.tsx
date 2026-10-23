"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { confirmSellerAvailability, listingInventory, listingPrice, myListings, updateListingInventory, type InventoryRow, type MarketListing } from "@/lib/marketplace"

export default function InventoryClient() {
  const [listings, setListings] = useState<MarketListing[]>([])
  const [selected, setSelected] = useState<MarketListing | null>(null)
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [notice, setNotice] = useState("")
  const load = () => myListings().then((page) => setListings(page.results)).catch((reason) => setNotice(reason instanceof Error ? reason.message : "Could not load inventory."))
  useEffect(() => { void load() }, [])
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
    try { await confirmSellerAvailability([selected.id]); setNotice("Availability confirmed. Any required moderation will run before publication."); await load() }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not confirm availability.") }
  }
  return <main className="mx-auto max-w-5xl px-4 py-10"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-pink-600">Seller dashboard</p><h1 className="text-4xl font-black">Inventory</h1><p className="mt-2 text-foreground/65">Available stock excludes units reserved by active checkouts and auctions.</p></div><Link href="/seller/listings" className="rounded-full border border-pink-200 px-5 py-3 font-bold text-pink-700">Back to listings</Link></div><div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"><section className="space-y-3">{listings.map((listing) => <button type="button" key={listing.id} onClick={() => void choose(listing)} className={`w-full rounded-2xl border p-4 text-left ${selected?.id === listing.id ? "border-pink-500 bg-pink-50" : "border-pink-100"}`}><span className="block font-black">{listing.title}</span><span className="text-sm">{listingPrice(listing)}</span>{listing.inactive_paused_at && <span className="mt-1 block text-sm font-semibold text-amber-700">Paused for availability confirmation</span>}</button>)}</section><section className="rounded-3xl border border-pink-100 p-5">{!selected ? <p>Select a listing to manage stock.</p> : <><h2 className="text-2xl font-black">{selected.title}</h2>{selected.inactive_paused_at && <button type="button" onClick={() => void reactivate()} className="mt-4 min-h-11 rounded-full bg-pink-600 px-5 font-bold text-white">Confirm inventory and reactivate</button>}<div className="mt-5 space-y-3">{rows.map((row) => <InventoryEditor key={row.id} row={row} save={save} />)}{!rows.length && <p className="rounded-xl bg-pink-50 p-4 text-sm">This listing does not use finite stock tracking.</p>}</div></>}{notice && <p role="status" className="mt-4 rounded-xl bg-pink-50 p-3 text-sm">{notice}</p>}</section></div></main>
}

function InventoryEditor({ row, save }: { row: InventoryRow; save: (row: InventoryRow, total: number) => Promise<void> }) {
  const [total, setTotal] = useState(row.total_quantity)
  return <div className="rounded-2xl border p-4"><p className="font-semibold">{row.variant_id ? row.variant_name || `Variant #${row.variant_id}` : "Listing stock"}{row.variant_sku && <span className="ml-2 text-xs font-normal text-foreground/50">SKU {row.variant_sku}</span>}</p><p className="mt-1 text-sm text-foreground/60">Available {row.available_quantity ?? "unlimited"} · Reserved {row.reserved_quantity} · Sold {row.sold_quantity}</p><div className="mt-3 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Total physical stock<input type="number" min={row.reserved_quantity + row.sold_quantity} step="1" value={total} onChange={(event) => setTotal(Number(event.target.value))} className="mt-1 block w-32 rounded-xl border p-2" /></label><button type="button" onClick={() => void save(row, total)} className="min-h-11 rounded-full bg-pink-600 px-5 font-bold text-white">Save stock</button></div></div>
}
