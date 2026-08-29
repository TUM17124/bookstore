"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { BooksShowcase, type BookCfg } from "@/components/ui/books-showcase"
import { getBooks, asBookList, type Paginated, type ApiBook } from "@/lib/api"
import { OfferMarquee } from "@/components/offer-marquee"

function toCfg(b: ApiBook): BookCfg {
  return {
    id: String(b.id),
    title: b.title,
    author: b.author || "Unknown",
    year: b.year || "",
    stars: b.stars ?? 5,
    desc: b.desc || "",
    images: {
      front: b.images?.front || undefined,
      spine: b.images?.spine || undefined,
      back: b.images?.back || undefined,
    },
    edge: b.edge,
    spineBg: b.spineBg,
    spineInk: b.spineInk,
    spineFont: b.spineFont,
    backBg: b.backBg,
    backInk: b.backInk,
    chapters: b.chapters,
    price: b.price != null ? Number(b.price) : undefined,
    ebookPrice: b.ebook_price != null ? Number(b.ebook_price) : undefined,
    audiobookPrice:
      b.audiobook_price != null ? Number(b.audiobook_price) : undefined,
    hasEbook:
      b.hasEbook !== false && b.hasEbook !== undefined ? !!b.hasEbook : true,
    hasAudiobook: !!b.hasAudiobook,
    isFree: !!b.isFree,
  }
}

function orderWithSelected(
  fetchedBooks: BookCfg[],
  selectedBookId: string,
): BookCfg[] {
  if (!selectedBookId) return fetchedBooks
  const selectedIndex = fetchedBooks.findIndex(
    (book) => String(book.id) === selectedBookId,
  )
  if (selectedIndex === -1) return fetchedBooks
  const selectedBook = fetchedBooks[selectedIndex]
  const remainingBooks = fetchedBooks.filter((_, i) => i !== selectedIndex)
  if (remainingBooks.length === 0) return [selectedBook]
  return [remainingBooks[0], selectedBook, ...remainingBooks.slice(1)]
}

function queryFor(q: string, category: string) {
  if (q) return { search: q }
  if (category) return { category }
  return { featured: true }
}

function HomeInner() {
  const sp = useSearchParams()
  const q = (sp.get("q") || "").trim()
  const category = (sp.get("category") || "").trim()
  const selectedBookId = (sp.get("book") || "").trim()

  const [books, setBooks] = useState<BookCfg[]>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isPhone, setIsPhone] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    setIsPhone(window.matchMedia("(max-width: 760px)").matches)
  }, [])

  const loadPage = useCallback(
    async (p: number, replace: boolean) => {
      if (busy.current) return
      busy.current = true
      try {
        const data = await getBooks({ ...queryFor(q, category), page: p })
        const list = asBookList(data).map(toCfg)
        const more =
          !Array.isArray(data) && !!(data as Paginated<ApiBook>).next
        setHasMore(more)
        setPage(p)
        setBooks((prev) => {
          if (replace) return orderWithSelected(list, selectedBookId)
          const seen = new Set(prev.map((b) => b.id))
          return [...prev, ...list.filter((b) => !seen.has(b.id))]
        })
      } catch (e) {
        console.error(e)
        if (replace) {
          setBooks([])
          setError(true)
        }
      } finally {
        busy.current = false
        setLoading(false)
      }
    },
    [q, category, selectedBookId],
  )

  useEffect(() => {
    setLoading(true)
    setError(false)
    setHasMore(true)
    void loadPage(1, true)
  }, [loadPage])

  const onNearEnd = useCallback(() => {
    if (isPhone) return
    if (!hasMore || busy.current) return
    void loadPage(page + 1, false)
  }, [isPhone, hasMore, page, loadPage])

  const shelfBooks = isPhone ? books.slice(0, 6) : books

  if (loading) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center text-sm text-muted-foreground">
        Loading books…
      </main>
    )
  }

  if (books.length === 0) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] flex-col">
        <OfferMarquee />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
          <p>
            {error
              ? "Could not load books. Is the API up?"
              : q
                ? `No books found for “${q}”.`
                : category
                  ? `No books in “${category}”.`
                  : "No books yet. Add featured books in Django admin."}
          </p>
          {q || category ? (
            <a href="/" className="text-foreground underline hover:no-underline">
              Clear filters
            </a>
          ) : null}
        </div>
      </main>
    )
  }

  return (
    <main className="home-shelf">
      <OfferMarquee />
      <div className="home-shelf-stage">
        <BooksShowcase
          books={shelfBooks}
          onNearEnd={isPhone ? undefined : onNearEnd}
          heroTitle={selectedBookId || q ? "Results" : "Books"}
          navTitle={
            selectedBookId
              ? "Results"
              : q
                ? `Search: ${q}`
                : category
                  ? category
                  : "Bestsellers"
          }
          className="h-full min-h-0 w-full"
        />
      </div>
    </main>
  )
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center text-sm text-muted-foreground">
          Loading…
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  )
}