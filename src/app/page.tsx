"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { BooksShowcase, type BookCfg } from "@/components/ui/books-showcase"
import { getBooks, asBookList } from "@/lib/api"

function toCfg(b: ReturnType<typeof asBookList>[number]): BookCfg {
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
  }
}

/** Put selected book at index 1 (center of the 3-book row) */
function orderWithSelected(fetched: BookCfg[], selectedBookId: string): BookCfg[] {
  if (!selectedBookId) return fetched

  const selectedIndex = fetched.findIndex((book) => String(book.id) === selectedBookId)

  if (selectedIndex === -1) return fetched

  const selectedBook = fetched[selectedIndex]
  const remainingBooks = fetched.filter((_, index) => index !== selectedIndex)

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
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError("")

    getBooks(q ? { search: q } : category ? { category } : { featured: true })
      .then((data) => {
        const fetched = asBookList(data).map(toCfg)
        setBooks(orderWithSelected(fetched, selectedBookId))
      })
      .catch(() => setError("Could not load books. Is the API up?"))
      .finally(() => setLoading(false))
  }, [q, category, selectedBookId])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center p-8 text-sm text-red-500">
        {error}
      </main>
    )
  }

  if (loading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center text-sm text-foreground/50">
        Loading books…
      </main>
    )
  }

  if (!books.length) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center p-8 text-center text-sm text-foreground/50">
        {category
          ? `No books in “${category}”.`
          : q
            ? `No books found for “${q}”.`
            : "No books found."}
      </main>
    )
  }

  return (
    <main className="w-full min-h-[calc(100vh-5rem)]">
      <div className="h-[calc(100vh-5rem)] min-h-[560px] w-full">
        <BooksShowcase
          books={books}
          heroTitle={selectedBookId || q ? "Results" : "Books"}
          navTitle={
            selectedBookId || q
              ? q
                ? `Search: ${q}`
                : "Results"
              : category
                ? category
                : "Bestsellers"
          }
          className="h-full w-full"
        />
      </div>
    </main>
  )
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[50vh] items-center justify-center text-sm text-foreground/50">
          Loading…
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  )
}