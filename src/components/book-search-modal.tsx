"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  SearchModal,
  type SearchResult,
} from "./ui/search-modal"

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000/api"


/* =========================================================
   API BOOK TYPE
========================================================= */

type ApiBook = {
  id: string | number
  title: string
  author?: string
  images?: {
    front?: string | null
  }
}


/* =========================================================
   API RESPONSE HANDLER
========================================================= */

function asList(data: unknown): ApiBook[] {
  if (Array.isArray(data)) {
    return data as ApiBook[]
  }

  if (
    data &&
    typeof data === "object" &&
    "results" in data
  ) {
    const results = (
      data as {
        results: unknown
      }
    ).results

    return Array.isArray(results)
      ? (results as ApiBook[])
      : []
  }

  return []
}


/* =========================================================
   PROPS
========================================================= */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}


/* =========================================================
   COMPONENT
========================================================= */

export function BookSearchModal({
  open,
  onOpenChange,
}: Props) {

  const router = useRouter()

  const [results, setResults] =
    useState<SearchResult[]>([])

  const [loading, setLoading] =
    useState(false)

  const [hasSearched, setHasSearched] =
    useState(false)

  const [searchError, setSearchError] =
    useState(false)

  const lastQuery = useRef("")

  const timer =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    )


  /* =======================================================
     APPLY SEARCH FILTER
  ======================================================= */

  const applyFilter = (q: string) => {

    const query = q.trim()

    /*
     * Don't navigate if there is no search query.
     */

    if (!query) {
      return
    }

    /*
     * Don't close the modal until we know we have
     * something to show.
     */

    onOpenChange(false)

    /*
     * Filter BooksShowcase on the homepage.
     */

    router.push(
      `/?q=${encodeURIComponent(query)}`
    )
  }


  /* =======================================================
     SEARCH API
  ======================================================= */

  const onQueryChange = useCallback(
    (query: string) => {

      lastQuery.current = query

      /*
       * Cancel previous request timer.
       */

      if (timer.current) {
        clearTimeout(timer.current)
      }


      const q = query.trim()


      /* ===================================================
         EMPTY SEARCH
      =================================================== */

      if (!q) {

        setResults([])

        setLoading(false)

        setHasSearched(false)

        setSearchError(false)

        return
      }


      /* ===================================================
         START SEARCH
      =================================================== */

      setLoading(true)

      setHasSearched(true)

      setSearchError(false)

      /*
       * Clear previous results immediately.
       * This prevents old results from appearing while
       * the user is searching for something new.
       */

      setResults([])


      /* ===================================================
         DEBOUNCE
      =================================================== */

      timer.current = setTimeout(
        async () => {

          try {

            const res = await fetch(
              `${API}/books/?search=${encodeURIComponent(q)}`,
              {
                method: "GET",
                headers: {
                  Accept:
                    "application/json",
                },

                /*
                 * Prevent browser caching old search
                 * responses.
                 */

                cache: "no-store",
              }
            )


            /* =============================================
               BACKEND ERROR
            ============================================= */

            if (!res.ok) {
              throw new Error(
                `Search failed: ${res.status}`
              )
            }


            const data =
              await res.json()


            const books =
              asList(data)


            /*
             * Make sure this response still belongs
             * to the current search.
             *
             * Example:
             *
             * User types:
             * "har"
             *
             * then quickly types:
             * "harry"
             *
             * We don't want the "har" response replacing
             * the "harry" results.
             */

            if (
              lastQuery.current.trim() !== q
            ) {
              return
            }


            /* =============================================
               NO RESULTS
            ============================================= */

            if (books.length === 0) {

              setResults([])

              setSearchError(false)

              return
            }


            /* =============================================
               RESULTS FOUND
            ============================================= */

            setResults(
              books.map((book) => ({
                name: book.title,

                meta:
                  book.author ||
                  undefined,

                avatar:
                  book.images?.front ||
                  undefined,

                href: `/?q=${encodeURIComponent(q)}&book=${encodeURIComponent(String(book.id))}`,
              }))
            )

            setSearchError(false)

          } catch (error) {

            /*
             * Backend unavailable or request failed.
             */

            console.error(
              "Book search error:",
              error
            )

            setResults([])

            setSearchError(true)

          } finally {

            /*
             * Only stop loading if this is still
             * the current search.
             */

            if (
              lastQuery.current.trim() === q
            ) {
              setLoading(false)
            }
          }

        },
        300
      )

    },
    []
  )


  /* =======================================================
     SELECT RESULT
  ======================================================= */

  const onSelectResult = () => {

    const query =
      lastQuery.current.trim()

    /*
     * Never navigate if there is no query.
     */

    if (!query) {
      return
    }

    /*
     * We only reach here when a real search result
     * was selected.
     */

    applyFilter(query)
  }


  /* =======================================================
     PROFESSIONAL EMPTY STATE
  ======================================================= */

  /*
   * We use the SearchModal's results area.
   *
   * If your SearchModal supports custom empty content,
   * this is where it should be supplied.
   *
   * Since the current component API only exposes `results`,
   * we use a SearchResult entry as the professional
   * informational state.
   */

  let displayResults = results


  /* =======================================================
     NO RESULTS STATE
  ======================================================= */

  if (
    !loading &&
    hasSearched &&
    !searchError &&
    results.length === 0
  ) {

    displayResults = [
      {
        name: "No books found",
        meta:
          `We couldn't find any books matching "${lastQuery.current.trim()}".`,
        href: "#",
      },
    ]
  }


  /* =======================================================
     ERROR STATE
  ======================================================= */

  if (
    !loading &&
    hasSearched &&
    searchError
  ) {

    displayResults = [
      {
        name: "Unable to search books",
        meta:
          "Please check your connection and try again.",
        href: "#",
      },
    ]
  }


  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <SearchModal
      modal

      open={open}

      onOpenChange={onOpenChange}

      placeholder={
        loading
          ? "Searching books…"
          : "Search books, authors…"
      }

      tags={[]}

      quickActions={[]}

      files={[]}

      results={displayResults}

      onQueryChange={
        onQueryChange
      }

      onSelectResult={() => {

        /*
         * Don't navigate when the displayed result
         * is an informational "No books found" state.
         */

        if (
          results.length === 0
        ) {
          return
        }

        onSelectResult()
      }}
    />
  )
}