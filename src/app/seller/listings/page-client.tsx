"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { listingPrice, myListings, type MarketListing } from "@/lib/marketplace"

export default function SellerListings() {
  const [rows, setRows] = useState<MarketListing[]>([])
  const [error, setError] = useState("")
  useEffect(() => { myListings().then((page) => setRows(page.results)).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load listings.")) }, [])
  return <main className="mx-auto max-w-5xl px-4 py-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-semibold text-pink-600">Seller dashboard</p><h1 className="text-4xl font-black">Your listings</h1></div><div className="flex flex-wrap gap-2"><Link href="/seller/orders" className="rounded-full border border-pink-200 px-5 py-3 font-bold text-pink-700">Orders &amp; earnings</Link><Link href="/auctions" className="rounded-full border border-pink-200 px-5 py-3 font-bold text-pink-700">Create Auction</Link><Link href="/sell" className="rounded-full bg-pink-600 px-5 py-3 font-bold text-white">Create listing</Link></div></div>{error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}<div className="mt-8 grid gap-5 sm:grid-cols-2">{rows.map((listing) => <article key={listing.id} className="rounded-3xl border bg-white p-5 shadow-sm dark:bg-zinc-950"><div className="flex gap-4">{listing.media[0] && <img src={listing.media[0].image || listing.media[0].external_url} alt="" className="h-24 w-24 rounded-xl object-cover" />}<div><h2 className="text-xl font-black">{listing.title}</h2><p>{listingPrice(listing)}</p><p className="mt-1 text-sm capitalize text-foreground/60">{listing.status} · {listing.moderation_status}</p></div></div><div className="mt-5 flex flex-wrap gap-2">{listing.status === "active" && listing.moderation_status === "approved" && <Link href="/advertise" className="rounded-full bg-pink-600 px-4 py-2 text-sm font-bold text-white">Advertise Product</Link>}<a href={`/listings/${listing.slug}/`} className="rounded-full border px-4 py-2 text-sm font-bold">View public page</a></div></article>)}{!rows.length && !error && <div className="rounded-2xl border border-dashed p-10 text-center">You have no marketplace listings yet.</div>}</div></main>
}
