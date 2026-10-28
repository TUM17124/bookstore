"use client"
import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCategories, marketplaceCategoryIcon } from "@/lib/categories"
import { useSiteConfig, useText } from "@/lib/site-config"
import BookPublishForm from "@/components/book-publish-form"
import SellPage from "@/app/sell/page-client"
import { publishingCategoryHref, publishingDescription, publishingKind } from "./departments"
import { BookOpen, Briefcase, Gavel, Package } from "lucide-react"

function PublishEntry() {
  const query = useSearchParams()
  const { all, ready } = useCategories()
  const [config] = useSiteConfig()
  const title = useText('publish.entry_title')
  const description = useText('publish.entry_description')
  const listingEnabled = !!(config?.features?.marketplace || config?.features?.marketplace_publishing)
  if(query.get('kind') === 'book') return <><nav className="mx-auto max-w-lg px-4 pt-6"><Link href="/publish/" className="underline">All publishing options</Link></nav><BookPublishForm initialCategory={query.get("category") || ""} /></>
  if(query.get('category')) return <><nav className="mx-auto max-w-4xl px-4 pt-6"><Link href="/publish/" className="underline">All publishing options</Link></nav><SellPage /></>
  const roots = all.filter(c => !c.parent)
  const productDepartments = roots.filter(c => publishingKind(c) === "product")
  const serviceDepartments = roots.filter(c => publishingKind(c) === "service")
  const bookDepartments = roots.filter(c => publishingKind(c) === "book")
  const bookEnabled = config?.features?.publishing !== false
  return <main className="mx-auto max-w-6xl px-4 py-10"><h1 className="text-4xl font-black">{title}</h1><p className="mt-4 max-w-3xl text-muted-foreground">{description}</p>
    {!ready && <p role="status" className="mt-6">Loading departments…</p>}
    {ready && <section aria-label="Choose what to publish" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <PrimaryAction icon={BookOpen} title="Publish a book" description="Submit a book manuscript and cover for review, then manage its publication in your dashboard." href="/publish/?kind=book" enabled={bookEnabled} action={bookEnabled ? "Start book publishing" : "Book submissions paused"} />
      <PrimaryAction icon={Package} title="Sell products" description="List physical or digital products in the department that best describes them." href="#product-departments" enabled={listingEnabled} action={listingEnabled ? "Choose a product department" : "Product submissions paused"} />
      <PrimaryAction icon={Briefcase} title="Offer a service" description="Publish a service with clear scope, pricing and availability." href="#service-departments" enabled={listingEnabled} action={listingEnabled ? "Choose a service department" : "Service submissions paused"} />
      {config?.features?.auctions && <PrimaryAction icon={Gavel} title="Create an auction" description="Choose an approved listing, set bidding details and submit the auction for review." href="/auctions/?create=1" enabled={listingEnabled} action={listingEnabled ? "Open auction tools" : "New submissions paused"} />}
    </section>}
    {ready && <DepartmentSection id="product-departments" title="Product departments" description="Choose the department that best matches the item. Category fields and stock requirements are set by PlugYard." departments={productDepartments} enabled={listingEnabled} />}
    {ready && <DepartmentSection id="service-departments" title="Service departments" description="Choose a service department. The listing form uses the category's service and availability settings." departments={serviceDepartments} enabled={listingEnabled} />}
    {ready && bookDepartments.length > 0 && <DepartmentSection id="book-departments" title="Book departments" description="Choose a book department in the publishing form; accepted books remain subject to review." departments={bookDepartments} enabled={bookEnabled} />}
  </main>
}
export default function PublishPage() { return <Suspense fallback={<p className="p-8">Loading publishing options…</p>}><PublishEntry /></Suspense> }

function PrimaryAction({ icon: Icon, title, description, href, enabled, action }: { icon: typeof BookOpen; title: string; description: string; href: string; enabled: boolean; action: string }) {
  return <article className="flex min-w-0 flex-col rounded-3xl border border-border bg-card p-5 text-card-foreground shadow-sm">
    <Icon aria-hidden="true" className="size-8 text-[var(--brand-pink-text)]" />
    <h2 className="mt-4 text-lg font-bold">{title}</h2>
    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
    {enabled ? <Link href={href} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-center text-sm font-semibold hover:border-[var(--brand-pink-text)]">{action}</Link> : <p role="status" className="mt-5 rounded-xl bg-muted p-3 text-sm">{action}</p>}
  </article>
}

function DepartmentSection({ id, title, description, departments, enabled }: { id: string; title: string; description: string; departments: ReturnType<typeof useCategories>["all"]; enabled: boolean }) {
  if (departments.length === 0) return null
  return <section id={id} className="mt-12 scroll-mt-24" aria-labelledby={`${id}-title`}>
    <div className="mb-5"><h2 id={`${id}-title`} className="text-2xl font-black">{title}</h2><p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {departments.map(category => {
        const Icon = marketplaceCategoryIcon(category.label, category.slug, category.icon, publishingKind(category) === "book", category.fulfillment_type)
        return <article key={category.slug} className="flex min-w-0 flex-col rounded-3xl border border-border bg-card p-5 text-card-foreground">
          <Icon aria-hidden="true" className="size-8 text-[var(--brand-pink-text)]" />
          <h3 className="mt-4 text-lg font-bold">{category.label}</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{publishingDescription(category)}</p>
          {enabled ? <Link href={publishingKind(category) === "book" ? `/publish/?kind=book&category=${encodeURIComponent(category.slug)}` : publishingCategoryHref(category)} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-center text-sm font-semibold hover:border-[var(--brand-pink-text)]">{publishingKind(category) === "book" ? "Publish in this department" : publishingKind(category) === "service" ? "Offer this service" : "List in this department"}</Link> : <p role="status" className="mt-5 text-sm">Submissions are currently paused.</p>}
        </article>
      })}
    </div>
  </section>
}
