"use client"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { BooksShowcase, type BookCfg, type ShowcaseSection } from "@/components/ui/books-showcase"
import { asBookList, getHomeSections } from "@/lib/api"
import { useCategories } from "@/lib/categories"
import { toCfg } from "@/components/books-department-legacy"

function BooksDepartmentContent() {
  const query = useSearchParams()
  const category = query.get("category") || ""
  const { all } = useCategories()
  const genres = all.filter(c => c.viewer_mode === "book_3d")
  const current = genres.find(c => c.slug === category)
  const children = genres.filter(c => c.parent === (current?.slug || genres.find(x => !x.parent)?.slug))
  const [format, setFormat] = useState("")
  const [free, setFree] = useState(false)
  const [search, setSearch] = useState("")
  const [ordering, setOrdering] = useState("newest")
  const [page, setPage] = useState(1)
  const [books, setBooks] = useState<BookCfg[]>([])
  const [sections, setSections] = useState<ShowcaseSection[]>([])
  const [count, setCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const abort = new AbortController()
    const params = new URLSearchParams({ category, book_format: format, search, ordering, page: String(page), free: free ? "1" : "0" })
    const timer = setTimeout(async () => {
      setLoading(true); setError("")
      try {
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/books-department/?${params}`, { signal: abort.signal })
        if (!r.ok) throw new Error("Could not load this department. Please try again.")
        const data = await r.json()
        setBooks(asBookList(data).map(toCfg)); setCount(data.count); setHasNext(!!data.next)
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Could not load books.") }
      finally { if (!abort.signal.aborted) setLoading(false) }
    }, 200)
    return () => { abort.abort(); clearTimeout(timer) }
  }, [category, format, free, search, ordering, page])
  useEffect(() => {
    let live = true
    getHomeSections(category).then(data => { if (live && data) setSections(data.sections.map(s => ({ ...s, books: s.books.map(toCfg) }))) }).catch(() => undefined)
    return () => { live = false }
  }, [category])
  return <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-8">
    <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap gap-2 text-sm text-muted-foreground"><Link href="/">Marketplace</Link><span>/</span><Link href="/books/">Books</Link>{current && <><span>/</span><span>{current.label}</span></>}</nav>
    <h1 className="text-4xl font-black">{current?.label || "Books"}</h1><p className="mt-3 text-muted-foreground">{current?.description}</p>
    <nav aria-label="Browse by genre" className="my-6 flex flex-wrap gap-2"><Link href="/books/" className="rounded-full border px-4 py-2">All Books</Link>{children.map(c => <Link key={c.slug} href={`/books/?category=${encodeURIComponent(c.slug)}`} className="rounded-full border bg-card px-4 py-2 hover:bg-accent">{c.label}</Link>)}</nav>
    <div className="mb-6 grid gap-3 sm:grid-cols-4"><label className="text-sm">Browse by format<select value={format} onChange={e => { setFormat(e.target.value); setPage(1) }} className="mt-1 w-full rounded-xl border bg-background p-3"><option value="">All formats</option><option value="ebook">Ebook</option><option value="audiobook">Audiobook</option></select></label><label className="text-sm">Search books or authors<input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="mt-1 w-full rounded-xl border bg-background p-3" /></label><label className="text-sm">Sort<select value={ordering} onChange={e => { setOrdering(e.target.value); setPage(1) }} className="mt-1 w-full rounded-xl border bg-background p-3"><option value="newest">New arrivals</option><option value="popular">Most reviewed</option><option value="title">Title</option><option value="price">Price: low to high</option><option value="-price">Price: high to low</option></select></label><label className="flex items-center gap-2"><input type="checkbox" checked={free} onChange={e => { setFree(e.target.checked); setPage(1) }} />Free books</label></div>
    {error && <p role="alert">{error}</p>}{loading && <p role="status">Loading books…</p>}
    {!loading && !error && !books.length && <p className="rounded-2xl border p-8">No books match these filters. Choose another format or genre.</p>}
    <BooksShowcase className="books-department-showcase" books={books} sections={!format && !free && !search && page === 1 ? sections : []} navTitle="All Books" heroTitle={current?.label || "Books"} openBookId={query.get("book") || ""} openView={query.get("view") || ""} />
    <nav aria-label="Book pages" className="mt-6 flex justify-center gap-4"><button className="rounded-full border px-5 py-3 disabled:opacity-50" disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</button><span className="self-center">Page {page} · {count} books</span><button className="rounded-full border px-5 py-3 disabled:opacity-50" disabled={!hasNext || loading} onClick={() => setPage(p => p + 1)}>Next</button></nav>
  </main>
}

export default function BooksDepartment() { const query = useSearchParams(); return <BooksDepartmentContent key={query.get("category") || ""} /> }
