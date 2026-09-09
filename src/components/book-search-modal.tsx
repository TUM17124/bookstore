"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { SearchModal, type SearchResult } from "./ui/search-modal"
import { searchTrack } from "@/lib/api"

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api"

type ApiBook = {
  id: string | number
  title: string
  author?: string
  slug?: string
  images?: { front?: string | null }
}

function asList(data: unknown): ApiBook[] {
  if (Array.isArray(data)) return data as ApiBook[]
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results: unknown }).results
    return Array.isArray(results) ? (results as ApiBook[]) : []
  }
  return []
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BookSearchModal({ open, onOpenChange }: Props) {
  const router = useRouter()
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const lastQuery = useRef("")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SEARCH_TRACK_MS = 800

const onQueryChange = useCallback((value: string) => {
  lastQuery.current = value
  if (timer.current) clearTimeout(timer.current)
  if (trackTimer.current) clearTimeout(trackTimer.current)

  const q = value.trim()
  if (q.length < 2) {
    setResults([])
    setHasSearched(false)
    setSearchError(false)
    return
  }

  // fetch books (can stay faster)
  timer.current = setTimeout(async () => {
    setLoading(true)
    setSearchError(false)
    setHasSearched(true)
    try {
      const res = await fetch(`${API}/books/?search=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error("search failed")
      const books = asList(await res.json())
      setResults(
        books.map((b) => ({
          name: b.title,
          meta: b.author || "",
          avatar: b.images?.front || undefined,
          href: `/?book=${encodeURIComponent(String(b.id))}`,
          book_id: b.id,
          book_slug: b.slug || String(b.id),
        })),
      )
    } catch {
      setResults([])
      setSearchError(true)
    } finally {
      setLoading(false)
    }
  }, 350)

  // log search only after they stop typing
  trackTimer.current = setTimeout(() => {
    if (q.length < 3) return
    if (q !== lastQuery.current.trim()) return
    void searchTrack({
      event_type: "search",
      query: q,
      source: "modal",
    })
  }, SEARCH_TRACK_MS)
}, [])

  const onSelectResult = useCallback(
    (result: SearchResult) => {
      if (!result.href || result.href === "#") return
      void searchTrack({
        event_type: "click",
        query: lastQuery.current.trim(),
        book_id: result.book_id,
        book_slug: result.book_slug,
        source: "search",
      })
      onOpenChange(false)
      router.push(result.href)
    },
    [onOpenChange, router],
  )

  let displayResults: SearchResult[] = results

  if (!loading && hasSearched && !searchError && results.length === 0) {
    displayResults = [
      {
        name: "No books found",
        meta: `We couldn't find any books matching "${lastQuery.current.trim()}".`,
        href: "#",
      },
    ]
  }

  if (!loading && hasSearched && searchError) {
    displayResults = [
      {
        name: "Unable to search books",
        meta: "Please check your connection and try again.",
        href: "#",
      },
    ]
  }

  return (
    <SearchModal
      modal
      open={open}
      onOpenChange={onOpenChange}
      placeholder={loading ? "Searching books…" : "Search books, authors…"}
      tags={[]}
      quickActions={[]}
      files={[]}
      results={displayResults}
      onQueryChange={onQueryChange}
      onSelectResult={onSelectResult}
      source="search-modal"
      disableSearchTrack
      disableClickTrack
    />
  )
}