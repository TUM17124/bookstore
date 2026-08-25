"use client"

import { useEffect, useState } from "react"
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

export default function HomePage() {
  const [books, setBooks] = useState<BookCfg[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get("q")?.trim() || ""
    const category = params.get("category")?.trim() || ""

    setLoading(true)
    setError("")

    getBooks(
      q ? { search: q } : category ? { category } : { featured: true },
    )
      .then((data) => setBooks(asBookList(data).map(toCfg)))
      .catch(() => setError("Could not load books. Is the API up?"))
      .finally(() => setLoading(false))
  }, [])

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
      <main className="flex min-h-[50vh] items-center justify-center text-sm text-foreground/50">
        No books found.
      </main>
    )
  }

  return (
    <main className="w-full min-h-[calc(100vh-5rem)]">
      <div className="h-[calc(100vh-5rem)] min-h-[560px] w-full">
        <BooksShowcase
          books={books}
          heroTitle="Books"
          navTitle="Bestsellers"
          className="h-full w-full"
        />
      </div>
    </main>
  )
}