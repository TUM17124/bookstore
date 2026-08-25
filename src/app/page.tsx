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

function HomeInner() {
  const sp = useSearchParams()
  const q = (sp.get("q") || "").trim()
  const category = (sp.get("category") || "").trim()

  const [books, setBooks] = useState<BookCfg[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError("")
    getBooks(q ? { search: q } : category ? { category } : { featured: true })
      .then((data) => setBooks(asBookList(data).map(toCfg)))
      .catch(() => setError("Could not load books. Is the API up?"))
      .finally(() => setLoading(false))
  }, [q, category])

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
          ? `No books in “${category}”. Check Category in Django admin.`
          : "No books found."}
      </main>
    )
  }

  return (
    <main className="w-full min-h-[calc(100vh-5rem)]">
      <div className="h-[calc(100vh-5rem)] min-h-[560px] w-full">
        <BooksShowcase
          books={books}
          heroTitle="Books"
          navTitle={category ? category : q ? `Search: ${q}` : "Bestsellers"}
          className="h-full w-full"
        />
      </div>
    </main>
  )
}

function HomeFallback() {
  return (
    <main className="flex min-h-[50vh] items-center justify-center text-sm text-foreground/50">
      Loading…
    </main>
  )
}

/** Default export MUST wrap useSearchParams in Suspense for static export */
export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeInner />
    </Suspense>
  )
}