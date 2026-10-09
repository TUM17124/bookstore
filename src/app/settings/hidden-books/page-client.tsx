"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getHiddenBooks, unhideBook, type HiddenBookEntry } from "@/lib/api"
import { useAsyncAction } from "@/hooks/use-async-action"
import { ActionButton } from "@/components/ui/action-button"

function HiddenBookRow({
  entry,
  onUnhide,
}: {
  entry: HiddenBookEntry
  onUnhide: (id: number) => void
}) {
  const unhide = useAsyncAction(
    async (_ctx) => {
      await unhideBook(entry.book.id as unknown as number)
      onUnhide(entry.id)
    },
    { successMs: 0, errorFallback: "Couldn't unhide. Please try again." },
  )

  const cover = entry.book.images?.front
  const hiddenAt = new Date(entry.hidden_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt={entry.book.title} className="h-14 w-10 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-foreground/10 text-[10px] text-foreground/50">
          No cover
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{entry.book.title}</p>
        <p className="text-xs text-foreground/55">{entry.book.author}</p>
        <p className="mt-0.5 text-xs text-foreground/40">Hidden {hiddenAt}</p>
      </div>
      <ActionButton
        action={unhide}
        onClick={() => void unhide.run()}
        loadingLabel="Unhiding…"
        successLabel="Unhidden"
        errorClassName="text-xs text-red-600"
        className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium hover:bg-foreground/5 disabled:opacity-50"
      >
        Unhide
      </ActionButton>
    </div>
  )
}

export default function HiddenBooksPage() {
  const [entries, setEntries] = useState<HiddenBookEntry[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function load(p: number, append = false) {
    setLoading(true)
    setError("")
    try {
      const data = await getHiddenBooks(p)
      setEntries((prev) => (append ? [...prev, ...data.results] : data.results))
      setHasMore(!!data.next)
      setPage(p)
    } catch (e) {
      setError((e as Error).message || "Failed to load hidden books.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(1) }, [])

  function handleUnhide(entryId: number) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-16">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/settings" className="text-sm text-foreground/60 hover:underline">
          ← Settings
        </Link>
      </div>
      <h1 className="mb-1 text-2xl font-bold">Hidden books</h1>
      <p className="mb-6 text-sm text-foreground/60">
        Books you marked as "not interested". Unhide them to see them again on the home page.
      </p>

      {error && (
        <p className="mb-4 rounded border border-red-400 p-3 text-sm text-red-700">{error}</p>
      )}

      {loading && entries.length === 0 ? (
        <p className="text-sm text-foreground/60">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-foreground/60">No hidden books.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <HiddenBookRow key={entry.id} entry={entry} onUnhide={handleUnhide} />
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(page + 1, true)}
          className="mt-6 w-full rounded-lg border py-2 text-sm text-foreground/60 hover:bg-foreground/5 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </main>
  )
}
