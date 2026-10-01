"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { BooksShowcase, type BookCfg, type ShowcaseSection } from "@/components/ui/books-showcase"
import { getBooks, getBook, asBookList, getHomeSections, type Paginated, type ApiBook, type CategoryInfo, type SectionBook } from "@/lib/api"
import { useCategories } from "@/lib/categories"
import { CategoryChips } from "@/components/category-nav/category-chips"
import { CategoryBar } from "@/components/category-nav/category-bar"
import { errorMessage } from "@/lib/auth-fetch"
import { OfferMarquee } from "@/components/offer-marquee"
import { searchTrack } from '@/lib/api'

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
    ebookDownloadable: b.ebookDownloadable !== false,
    audiobookDownloadable: b.audiobookDownloadable !== false,
    category: b.category || undefined,
    isFree: !!b.isFree,
    isFeatured: !!b.is_featured,
    previewPages: b.previewPages != null ? Number(b.previewPages) : 4,
    audioUrl: b.audioUrl || undefined,
    pdfUrl: b.pdfUrl || undefined,
    ratingAvg: (b as SectionBook).rating_avg,
    ratingCount: (b as SectionBook).rating_count,
  }
}

/** Part B: the personalised sections for this page (home or a category).
 * Refetched when the user logs in/out or changes their profile, so the
 * personal sections match who is looking. */
function useHomeSections(category: string, enabled: boolean) {
  const [sections, setSections] = useState<ShowcaseSection[]>([])
  const [info, setInfo] = useState<CategoryInfo | null>(null)
  const [error, setError] = useState("")
  const [notFound, setNotFound] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setSections([])
      setInfo(null)
      return
    }
    const ctrl = new AbortController()
    setError("")
    setNotFound(false)
    getHomeSections(category || undefined, { signal: ctrl.signal })
      .then((page) => {
        setInfo(page.category)
        setSections(
          page.sections.map((sec) => ({
            id: sec.id,
            title: sec.title,
            description: sec.description,
            personal: sec.personal,
            why: sec.why,
            books: sec.books.map(toCfg),
          })),
        )
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        if ((err as { status?: number }).status === 404) {
          setNotFound(true)
          setSections([])
          return
        }
        setError(errorMessage(err, "Couldn't load the sections."))
      })
    return () => ctrl.abort()
  }, [category, enabled, nonce])

  useEffect(() => {
    const again = () => setNonce((n) => n + 1)
    window.addEventListener("auth-changed", again)
    return () => window.removeEventListener("auth-changed", again)
  }, [])

  return { sections, info, error, notFound, retry: () => setNonce((n) => n + 1) }
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
  return [selectedBook, ...remainingBooks]
}

function queryFor(q: string, category: string) {
  if (q) return { search: q }
  if (category) return { category }
  return { featured: true }
}

function HomeInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const q = (sp.get("q") || "").trim()
  const category = (sp.get("category") || "").trim()
  const selectedBookId = (sp.get("book") || "").trim()

  const view = (sp.get('view') || '').trim() // read | listen | reviews

  const [books, setBooks] = useState<BookCfg[]>([])
  const home = useHomeSections(category, !q)
  const { navbar: navCats } = useCategories()
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const busy = useRef(false)
  const pageRef = useRef(1)
  const hasMoreRef = useRef(true)
  const selectedBookIdRef = useRef(selectedBookId)
  useEffect(() => {
    selectedBookIdRef.current = selectedBookId
  }, [selectedBookId])

  const loadPage = useCallback(
    async (p: number, replace: boolean) => {
      if (busy.current) return
      if (!replace && !hasMoreRef.current) return
      busy.current = true
      try {
        const phone =
          typeof window !== "undefined" &&
          (window.matchMedia("(max-width: 760px)").matches ||
            window.matchMedia("(pointer: coarse)").matches)
        const data = await getBooks({
          ...queryFor(q, category),
          page: p,
          pageSize: phone ? 6 : 12,
        })
        const list = asBookList(data).map(toCfg)
        const more =
          !Array.isArray(data) && !!(data as Paginated<ApiBook>).next
        hasMoreRef.current = more
        pageRef.current = p
        if (p === 1 && q) {
          void searchTrack({
            event_type: "search",
            query: q,
            source: "home",
          })
        }
        setBooks((prev) => {
          if (replace) return orderWithSelected(list, selectedBookIdRef.current)
          const seen = new Set(prev.map((b) => b.id))
          return [
            ...prev,
            ...list.filter((b) => {
              if (!seen.has(b.id)) {
                seen.add(b.id)
                return true
              }
              return !!b.isFeatured
            }),
          ]
        })
      } catch (e) {
        console.error(e)
        if (replace) {
          setBooks([])
          setError(true)
        }
      } finally {
        busy.current = false
        if (replace) setLoading(false)
      }
    },
    [q, category],
  )

  useEffect(() => {
    setLoading(true)
    setError(false)
    hasMoreRef.current = true
    pageRef.current = 1
    void loadPage(1, true)
  }, [loadPage])

  const onNearEnd = useCallback(() => {
    if (busy.current || !hasMoreRef.current) return
    void loadPage(pageRef.current + 1, false)
  }, [loadPage])

  const onBookSelect = useCallback((book: BookCfg | null) => {
    if (book) return
    // Closing: drop the stale book/view params so the URL (and nav title)
    // fall back to whatever search or category the user was actually in,
    // instead of staying stuck on "Results".
    const params = new URLSearchParams(window.location.search)
    params.delete("book")
    params.delete("view")
    const qs = params.toString()
    router.replace(qs ? `/?${qs}` : "/", { scroll: false })
  }, [router])

  const onSectionBookOpen = useCallback(
    (book: BookCfg) => {
      setBooks((prev) => (prev.some((b) => b.id === book.id) ? prev : [...prev, book]))
      const params = new URLSearchParams(window.location.search)
      params.set("book", book.id)
      router.replace(`/?${params.toString()}`, { scroll: false })
    },
    [router],
  )

  const topSlot = q ? null : (
    <>
      {/* Phones: swipeable chips (+ "All" sheet). Tablets: the same
          "Priority + More" bar as the desktop navbar, full width. Sticky
          under the navbar while the page scrolls. */}
      <div className="sticky top-0 z-20 -mx-[clamp(16px,4cqw,36px)] mb-5 bg-[var(--bs-bg-light)] px-[clamp(16px,4cqw,36px)] py-1.5 dark:bg-[var(--bs-bg-dark)] lg:hidden">
        <CategoryChips activeSlug={category} />
        <div className="hidden md:block">
          <CategoryBar categories={navCats} activeSlug={category} />
        </div>
      </div>
      {home.info ? (
        <header className="mb-6">
          <h1 className="text-[clamp(22px,2.6cqw,32px)] font-extrabold tracking-[-0.01em]">{home.info.label}</h1>
          {home.info.description ? <p className="mt-1 text-sm opacity-70">{home.info.description}</p> : null}
        </header>
      ) : null}
      {home.notFound ? (
        <p role="status" className="mb-6 rounded-xl border border-current/15 px-3 py-2 text-sm">
          This category isn&apos;t available right now.{" "}
          <Link href="/" className="font-semibold underline">
            See all books
          </Link>
        </p>
      ) : null}
      {home.error ? (
        <p role="alert" className="mb-6 rounded-xl border border-current/15 px-3 py-2 text-sm">
          {home.error}{" "}
          <button type="button" className="font-semibold underline" onClick={home.retry}>
            Try again
          </button>
        </p>
      ) : null}
    </>
  )

  useEffect(() => {
    if (!selectedBookId || loading) return
    if (books.some((b) => b.id === selectedBookId)) return
    let cancelled = false
    getBook(selectedBookId)
      .then((b) => {
        if (cancelled || !b) return
        const cfg = toCfg(b)
        setBooks((prev) =>
          prev.some((x) => x.id === cfg.id) ? prev : [...prev, cfg],
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selectedBookId, loading, books])

  if (loading) {
    return (
      <main className="home-shelf">
        <OfferMarquee />
        <div className="flex min-h-[calc(100dvh-6rem)] flex-1 items-center justify-center text-sm text-muted-foreground">
          Opening the shelf…
        </div>
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
          books={books}
          sections={home.sections}
          onSectionBookOpen={onSectionBookOpen}
          topSlot={topSlot}
          openBookId={selectedBookId}
          openView={view}
          onNearEnd={onNearEnd}
          onBookSelect={onBookSelect}
          heroTitle={selectedBookId || q ? "Results" : "Books"}
          navTitle={
            selectedBookId
              ? "Results"
              : q
                ? `Search: ${q}`
                : category
                  ? `All ${home.info?.label ?? category} books`
                  : home.sections.length
                    ? "All books"
                    : "Bestsellers"
          }
          className="h-full min-h-0 w-full"
        />
      </div>
    </main>
  )
}

export default function HomePageClient() {
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