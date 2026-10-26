"use client"
import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCategories, CategoryIcon } from "@/lib/categories"
import { useSiteConfig, useText } from "@/lib/site-config"
import BookPublishForm from "@/components/book-publish-form"
import SellPage from "@/app/sell/page-client"

function PublishEntry() {
  const query = useSearchParams()
  const { all, ready } = useCategories()
  const [config] = useSiteConfig()
  const title = useText('publish.entry_title')
  const description = useText('publish.entry_description')
  const listingEnabled = !!(config?.features?.marketplace || config?.features?.marketplace_publishing)
  if(query.get('kind') === 'book') return <><nav className="mx-auto max-w-lg px-4 pt-6"><Link href="/publish/" className="underline">All publishing options</Link></nav><BookPublishForm /></>
  if(query.get('category')) return <><nav className="mx-auto max-w-4xl px-4 pt-6"><Link href="/publish/" className="underline">All publishing options</Link></nav><SellPage /></>
  const roots = all.filter(c => !c.parent)
  return <main className="mx-auto max-w-6xl px-4 py-10"><h1 className="text-4xl font-black">{title}</h1><p className="mt-4 max-w-3xl text-muted-foreground">{description}</p>
    {!ready && <p role="status" className="mt-6">Loading departments…</p>}
    {ready && !roots.length && <p className="mt-6">No departments are available for publishing yet.</p>}
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{roots.map(c => {
      const book = c.viewer_mode === 'book_3d'
      const enabled = book ? config?.features?.publishing !== false : listingEnabled
      return <article key={c.slug} className="rounded-3xl border bg-card p-6"><CategoryIcon name={c.icon} className="size-8 text-[var(--brand-pink-text)]" /><h2 className="mt-4 text-xl font-bold">{c.label}</h2><p className="mt-2 text-sm text-muted-foreground">{c.description}</p>{enabled ? <Link href={book ? '/publish/?kind=book' : `/publish/?category=${encodeURIComponent(c.slug)}`} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border px-5 font-semibold">{book ? 'Publish book' : c.viewer_mode === 'service' ? 'Offer service' : 'List product'}</Link> : <p className="mt-5 text-sm">New submissions are currently paused for this department.</p>}</article>
    })}</div>
    {config?.features?.auctions && <Link href="/auctions/" className="mt-8 inline-flex rounded-full border px-5 py-3">Auction seller tools</Link>}
  </main>
}
export default function PublishPage() { return <Suspense fallback={<p className="p-8">Loading publishing options…</p>}><PublishEntry /></Suspense> }
