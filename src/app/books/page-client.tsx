"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { BooksShowcase, type BookCfg, type ShowcaseSection } from "@/components/ui/books-showcase"
import { asBookList, getBook, getHomeSections } from "@/lib/api"
import { useCategories } from "@/lib/categories"
import { toCfg } from "@/components/books-department-legacy"
import { RecommendedBooks } from "@/components/ui/books-showcase"
import { Banners } from "@/components/offers/banners"

function booksHref(params: URLSearchParams) {
  const query = params.toString()
  return query ? `/books/?${query}` : "/books/"
}

function BooksDepartmentContent() {
  const query = useSearchParams()
  const router = useRouter()
  const category = query.get("category") || ""
  const selectedBookId = query.get("book") || ""
  const { all } = useCategories()
  const genres = all.filter((category) => category.viewer_mode === "book_3d")
  const current = genres.find((item) => item.slug === category)
  const children = genres.filter((item) => item.parent === (current?.slug || genres.find((item) => !item.parent)?.slug))
  const [format, setFormat] = useState("")
  const [free, setFree] = useState(false)
  const [search, setSearch] = useState("")
  const [ordering, setOrdering] = useState("newest")
  const [page, setPage] = useState(1)
  const [books, setBooks] = useState<BookCfg[]>([])
  const [detailBook, setDetailBook] = useState<BookCfg | null>(null)
  const [sections, setSections] = useState<ShowcaseSection[]>([])
  const [count, setCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [error, setError] = useState("")
  const [detailError, setDetailError] = useState("")
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const detailNavigationRef = useRef(false)

  useEffect(() => {
    if (selectedBookId) return
    const abort = new AbortController()
    const params = new URLSearchParams({ category, book_format: format, search, ordering, page: String(page), free: free ? "1" : "0" })
    const timer = setTimeout(async () => {
      setLoading(true)
      setError("")
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/books-department/?${params}`, { signal: abort.signal })
        if (!response.ok) throw new Error("Could not load this department. Please try again.")
        const data = await response.json()
        setBooks(asBookList(data).map(toCfg))
        setCount(data.count)
        setHasNext(!!data.next)
      } catch (cause) {
        if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load books.")
      } finally {
        if (!abort.signal.aborted) setLoading(false)
      }
    }, 200)
    return () => { abort.abort(); clearTimeout(timer) }
  }, [category, format, free, search, ordering, page, selectedBookId])

  useEffect(() => {
    if (selectedBookId) {
      setSections([])
      return
    }
    let live = true
    getHomeSections(category)
      .then((data) => { if (live && data) setSections(data.sections.map((section) => ({ ...section, books: section.books.map(toCfg) }))) })
      .catch(() => undefined)
    return () => { live = false }
  }, [category, selectedBookId])

  useEffect(() => {
    if (!selectedBookId) {
      setDetailBook(null)
      setDetailError("")
      setDetailLoading(false)
      return
    }
    let live = true
    const fromCatalogue = books.find((book) => String(book.id) === selectedBookId)
    setDetailError("")
    setDetailBook(fromCatalogue || null)
    if (fromCatalogue) {
      setDetailLoading(false)
      return
    }
    setDetailLoading(true)
    getBook(selectedBookId)
      .then((book) => {
        if (!live) return
        if (!book) throw new Error("This book is no longer available.")
        setDetailBook(toCfg(book))
      })
      .catch((cause) => {
        if (live) setDetailError(cause instanceof Error ? cause.message : "This book could not be loaded.")
      })
      .finally(() => { if (live) setDetailLoading(false) })
    return () => { live = false }
  }, [selectedBookId, books])

  const onBookSelect = useCallback((book: BookCfg | null) => {
    const params = new URLSearchParams(window.location.search)
    if (book) {
      if (params.get("book") === book.id) return
      params.set("book", book.id)
      detailNavigationRef.current = true
      router.push(booksHref(params), { scroll: false })
      return
    }
    if (!params.has("book")) return
    if (detailNavigationRef.current) {
      detailNavigationRef.current = false
      router.back()
      return
    }
    params.delete("book")
    params.delete("view")
    router.replace(booksHref(params), { scroll: false })
  }, [router])

  const showcaseBooks = selectedBookId && detailBook
    ? books.some((book) => book.id === detailBook.id) ? books : [...books, detailBook]
    : books

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-8">
      {!selectedBookId && <Banners placement="category" category={category || genres.find((item) => !item.parent)?.slug || "books"} />}
      {!selectedBookId ? (
        <>
          <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Link href="/">Marketplace</Link><span>/</span><Link href="/books/">Books</Link>{current && <><span>/</span><span>{current.label}</span></>}
          </nav>
          <h1 className="text-4xl font-black">{current?.label || "Books"}</h1>
          {current?.description && <p className="mt-3 text-muted-foreground">{current.description}</p>}
          <nav aria-label="Browse by genre" className="my-6 flex flex-wrap gap-2">
            <Link href="/books/" className="rounded-full border px-4 py-2">All Books</Link>
            {children.map((item) => <Link key={item.slug} href={`/books/?category=${encodeURIComponent(item.slug)}`} className="rounded-full border bg-card px-4 py-2 hover:bg-accent">{item.label}</Link>)}
          </nav>
          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            <label className="text-sm">Browse by format<select value={format} onChange={(event) => { setFormat(event.target.value); setPage(1) }} className="mt-1 w-full rounded-xl border bg-background p-3"><option value="">All formats</option><option value="ebook">Ebook</option><option value="audiobook">Audiobook</option></select></label>
            <label className="text-sm">Search books or authors<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} className="mt-1 w-full rounded-xl border bg-background p-3" /></label>
            <label className="text-sm">Sort<select value={ordering} onChange={(event) => { setOrdering(event.target.value); setPage(1) }} className="mt-1 w-full rounded-xl border bg-background p-3"><option value="newest">New arrivals</option><option value="popular">Most reviewed</option><option value="title">Title</option><option value="price">Price: low to high</option><option value="-price">Price: high to low</option></select></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={free} onChange={(event) => { setFree(event.target.checked); setPage(1) }} />Free books</label>
          </div>
        </>
      ) : null}

      {selectedBookId && detailLoading && <p role="status" className="py-10 text-center text-muted-foreground">Loading book…</p>}
      {selectedBookId && detailError && <p role="alert" className="py-10 text-center">{detailError}</p>}
      {!selectedBookId && error && <p role="alert">{error}</p>}
      {!selectedBookId && loading && <p role="status" className="py-6 text-center text-muted-foreground">Loading books…</p>}
      {!selectedBookId && !loading && !error && !books.length && <p className="rounded-2xl border p-8">No books match these filters. Choose another format or genre.</p>}

      {selectedBookId ? (detailBook && (
        <BooksShowcase
          className="books-department-showcase"
          documentFlow
          books={showcaseBooks}
          sections={[]}
          showNav={false}
          showRecommendations={false}
          heroTitle="Book details"
          openBookId={selectedBookId}
          openView={query.get("view") || ""}
          onBookSelect={onBookSelect}
        />
      )) : !loading && !error && books.length > 0 ? (
        <BooksShowcase
          className="books-department-showcase"
          documentFlow
          books={books}
          sections={!format && !free && !search && page === 1 ? sections : []}
          navTitle="All Books"
          heroTitle={current?.label || "Books"}
          onBookSelect={onBookSelect}
        />
      ) : null}

      {selectedBookId && detailBook && !detailLoading && !detailError && (
        <div id="recommended-books" className="mt-8 scroll-mt-20">
          <Banners placement="book" />
          <RecommendedBooks book={detailBook} onBookSelect={onBookSelect} />
        </div>
      )}

      {!selectedBookId && <nav aria-label="Book pages" className="mt-6 flex justify-center gap-4">
        <button className="rounded-full border px-5 py-3 disabled:opacity-50" disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button>
        <span className="self-center">Page {page} · {count} books</span>
        <button className="rounded-full border px-5 py-3 disabled:opacity-50" disabled={!hasNext || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
      </nav>}
    </main>
  )
}

export default function BooksDepartment() {
  const query = useSearchParams()
  return <BooksDepartmentContent key={query.get("category") || ""} />
}
