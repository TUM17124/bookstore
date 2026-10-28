"use client"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Heart } from "lucide-react"
import { wishlist, marketCategories, type WishlistEntry, type MarketCategory } from "@/lib/marketplace"
import { ListingCard } from "@/components/marketplace/listing-card"
export default function WishlistPage() {
  const [rows, setRows] = useState<WishlistEntry[]>([])
  const [categories, setCategories] = useState<MarketCategory[]>([])
  const [category, setCategory] = useState("")
  const [page, setPage] = useState(1)
  const [next, setNext] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => { marketCategories().then(setCategories).catch(() => undefined) }, [])
  useEffect(() => { let live = true; wishlist(page,category).then(data => { if(live) { setRows(data.results); setNext(!!data.next) } }).catch(e => { if(live) setError(e instanceof Error ? e.message : "Could not load Wishlist.") }).finally(() => { if(live) setLoading(false) }); return () => { live = false } }, [page,category])
  function navigate(nextPage: number, nextCategory = category) {
    if (nextPage === page && nextCategory === category) return
    setLoading(true); setError(""); setRows([]); setPage(nextPage); setCategory(nextCategory)
  }
  return <main className="mx-auto max-w-7xl px-4 py-10"><div className="flex items-center gap-3"><Heart className="size-8 fill-[var(--brand-pink)] text-[var(--brand-pink-text)]" /><h1 className="text-4xl font-black">Wishlist</h1></div><p className="mt-2 text-muted-foreground">Products and books saved for later.</p>
    <label className="mt-6 flex flex-col gap-2 text-sm font-semibold sm:max-w-sm">Category<select value={category} onChange={e => navigate(1, e.target.value)} className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-background p-3 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><option value="">All categories</option>{categories.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}</select></label>
    {error && <p role="alert" className="mt-4 text-destructive">{error}</p>}{loading && <p role="status">Loading Wishlist…</p>}
    {!loading && !error && !rows.length && <div className="mt-10 rounded-3xl border border-dashed p-8 text-center"><p>No saved items match this selection.</p><Link href="/marketplace/" className="mt-4 inline-flex rounded-full border px-5 py-3">Browse marketplace</Link></div>}
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{rows.map(row => <ListingCard key={row.id} listing={row.listing} saved onRemoved={() => setRows(current => current.filter(item => item.id !== row.id))} />)}</div>
    <nav aria-label="Wishlist pages" className="mt-6 flex items-center justify-center gap-4"><button disabled={page === 1 || loading} onClick={() => navigate(page - 1)} className="min-h-11 rounded-full border px-5 disabled:opacity-50">Previous</button><span>Page {page}</span><button disabled={!next || loading} onClick={() => navigate(page + 1)} className="min-h-11 rounded-full border px-5 disabled:opacity-50">Next</button></nav>
  </main>
}
