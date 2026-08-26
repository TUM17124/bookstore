"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { BooksShowcase, type BookCfg } from "@/components/ui/books-showcase"
import { getBooks, asBookList } from "@/lib/api"

function toCfg(b: /* ApiBook */ any): BookCfg {
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
    audiobookPrice: b.audiobook_price != null ? Number(b.audiobook_price) : undefined,
    hasEbook: b.hasEbook !== false && b.hasEbook !== undefined
      ? !!b.hasEbook
      : true, // until API sends flags; better: !!b.hasEbook
    hasAudiobook: !!b.hasAudiobook,
  };
}

/** Selected search book at index 1 (center of the row) */
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
  const remainingBooks = fetchedBooks.filter((_, index) => index !== selectedIndex)

  if (remainingBooks.length === 0) {
    return [selectedBook]
  }

  return [remainingBooks[0], selectedBook, ...remainingBooks.slice(1)]
}

function HomeInner() {
  const sp = useSearchParams()

  const q = (sp.get("q") || "").trim()
  const category = (sp.get("category") || "").trim()
  const selectedBookId = (sp.get("book") || "").trim()

  const [books, setBooks] = useState<BookCfg[]>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)

    getBooks(
      q ? { search: q } : category ? { category } : { featured: true },
    )
      .then((data) => {
        const fetchedBooks = asBookList(data).map(toCfg)
        setBooks(orderWithSelected(fetchedBooks, selectedBookId))
      })
      .catch((e) => {
        console.error(e)
        setBooks([])
        setError(true)
      })
      .finally(() => setLoading(false))
  }, [q, category, selectedBookId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center text-sm text-muted-foreground">
        Loading books…
      </main>
    )
  }

  return (
    <main className="w-full min-h-[calc(100vh-5rem)]">
      <div className="h-[calc(100vh-5rem)] min-h-[560px] w-full">
        {books.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
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
              <a
                href="/"
                className="text-foreground underline hover:no-underline"
              >
                Clear filters
              </a>
            ) : null}
          </div>
        ) : (
          <BooksShowcase
            books={books}
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
            className="h-full w-full"
          />
        )}
      </div>
    </main>
  )
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center text-sm text-muted-foreground">
          Loading…
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  )
}