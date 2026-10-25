"use client"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useCategories, categoryHref, CategoryIcon } from "@/lib/categories"
import { usePairs, useText } from "@/lib/site-config"
import { marketListings, type MarketListing } from "@/lib/marketplace"
import { ListingCard } from "./listing-card"

export function MarketplaceHome() {
  const { all } = useCategories()
  const sections = usePairs('marketplace.home_sections')
  const title = useText('marketplace.hero_title')
  const description = useText('marketplace.hero_description')
  const sellLabel = useText('marketplace.sell_cta')
  const categoriesTitle = useText('marketplace.categories_title')
  return <main className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6">
    <section className="rounded-[2rem] bg-muted p-6 sm:p-12"><h1 className="max-w-3xl text-4xl font-black sm:text-6xl">{title}</h1><p className="mt-4 max-w-2xl text-lg text-muted-foreground">{description}</p>
      <form action="/marketplace/" className="mt-7 flex flex-wrap gap-3"><label className="min-w-0 basis-full sm:flex-1 sm:basis-0"><span className="sr-only">Search products, books and services</span><input name="search" placeholder="Search products, books and services" className="min-h-12 w-full rounded-full border border-input bg-background px-5" /></label><button className="min-h-12 rounded-full bg-primary px-6 font-bold text-primary-foreground">Search</button><Link href="/publish/" className="flex min-h-12 items-center justify-center rounded-full border px-6 font-semibold">{sellLabel}</Link></form>
    </section>
    {all.length > 0 && <section><h2 className="text-2xl font-bold">{categoriesTitle}</h2><nav aria-label="Marketplace departments" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{all.filter(c => !c.parent).map(c => <Link key={c.slug} href={categoryHref(c)} className="flex min-h-24 items-center gap-3 rounded-2xl border bg-card p-4 hover:bg-accent"><CategoryIcon name={c.icon} className="size-6 shrink-0 text-[var(--brand-pink-text)]" /><span className="font-semibold">{c.label}</span></Link>)}</nav></section>}
    {sections.map(section => <HomeCollection key={section.value} title={section.label} source={section.value} />)}
  </main>
}
function HomeCollection({ title, source }: { title: string; source: string }) {
  const [rows, setRows] = useState<MarketListing[]>([])
  const [error, setError] = useState(false)
  useEffect(() => { let current = true; const query = new URLSearchParams({ ordering: '-created_at' }); if(source !== 'latest') query.set('category', source);
    marketListings(query.toString()).then(data => { if(current) { setRows(data.results); setError(false) } }).catch(() => { if(current) setError(true) }); return () => { current = false }
  }, [source])
  const href = source === 'latest' ? '/marketplace/' : `/marketplace/?category=${encodeURIComponent(source)}`
  if(error) return <p role="status" className="text-muted-foreground">This collection could not be loaded. <Link href={href} className="underline">Browse the catalogue</Link></p>
  if(!rows.length) return null
  return <section><div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-bold">{title}</h2><Link href={href} className="text-sm underline">View all</Link></div><div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{rows.map(row => <ListingCard key={row.id} listing={row} />)}</div></section>
}
