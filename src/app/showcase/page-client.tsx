'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { demoShowcase, type MarketListing } from '@/lib/marketplace'
import { ListingCard } from '@/components/marketplace/listing-card'
import { ListingViewer } from '@/components/marketplace/listing-viewer'
import { DemoAuction } from '@/components/marketplace/demo-auction'

export default function DemoShowcase() {
  const query = useSearchParams()
  const slug = query.get('listing') || ''
  const [rows, setRows] = useState<MarketListing[]>([])
  const [selected, setSelected] = useState<MarketListing | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let live = true
    demoShowcase(slug).then(data => { if (live) { setRows(data.results); setSelected(slug ? data.results[0] || null : null) } })
      .catch(() => { if (live) setError('The demonstration showcase could not be loaded.') })
      .finally(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [slug])
  return <main className="mx-auto max-w-7xl px-4 py-8">
    <h1 className="text-4xl font-bold">Demonstration showcase</h1>
    <p className="my-5 rounded-2xl border border-primary bg-muted p-5 font-semibold">DEMO / NOT FOR SALE. Images, prices and stock illustrate the interface, not an offer of goods. No checkout, real bids or payment obligations are available here.</p>
    <Link href="/marketplace/" className="underline">Browse genuine marketplace listings</Link>
    {!loaded && <p role="status">Loading demonstrations…</p>}
    {error && <p role="alert" className="my-4 text-destructive">{error}</p>}
    {loaded && !error && !rows.length && <p className="my-8">No public demonstrations have been approved.</p>}
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{rows.map(row => <ListingCard key={row.id} listing={row} onOpen={() => setSelected(row)} />)}</div>
    {selected && <section aria-label="Demonstration details" className="mt-8 rounded-3xl border bg-card p-5 text-card-foreground">
      <div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-2xl font-bold">{selected.title}</h2><button className="min-h-11 rounded-full border px-4" onClick={() => setSelected(null)}>Close details</button></div>
      <div className="grid gap-6 md:grid-cols-2"><ListingViewer key={selected.id} listing={selected} /><div><p className="font-bold text-[var(--brand-pink-text)]">DEMO / NOT FOR SALE</p><p className="mt-4 whitespace-pre-wrap">{selected.description_text}</p><p className="mt-4">{selected.condition_and_defects}</p><p className="mt-4">This demonstration cannot be purchased or bid on.</p></div></div>
      {selected.demo_auction && <DemoAuction key={selected.id} slug={selected.slug} config={selected.demo_auction} />}
    </section>}
  </main>
}
