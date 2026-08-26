'use client'

import { useBookmarks } from '@/components/bookmarks-context'
import { BooksShowcase } from '@/components/ui/books-showcase'
import Link from 'next/link'
import { getToken } from '@/lib/api'

export default function BookmarksPage() {
  const { bookmarks, loading } = useBookmarks()
  const loggedIn = typeof window !== 'undefined' && !!getToken()

  return (
    <main className="relative z-0 w-full min-h-[calc(100vh-5rem)] pb-8">
      <div className="w-full h-[calc(100vh-5rem)] min-h-[560px]">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-foreground/50">
            Loading bookmarks…
          </div>
        ) : !loggedIn ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm">
            <p className="text-foreground/60">Log in to save and view bookmarks.</p>
            <Link href="/login" className="font-semibold text-sky-600 underline">
              Log in
            </Link>
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-foreground/50">
            No bookmarks yet. Save a book from the detail panel.
          </div>
        ) : (
          <BooksShowcase
            books={bookmarks}
            heroTitle="Bookmarks"
            navTitle="Saved"
            className="h-full w-full"
          />
        )}
      </div>
    </main>
  )
}