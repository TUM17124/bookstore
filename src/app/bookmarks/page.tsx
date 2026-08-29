'use client'

import Link from 'next/link'
import { BooksShowcase } from '@/components/ui/books-showcase'
import { useBookmarks } from '@/components/bookmarks-context'
import { OfferMarquee } from '@/components/offer-marquee'
import { getToken } from '@/lib/api'

export default function BookmarksPage() {
  const { bookmarks, loading } = useBookmarks()
  const loggedIn = typeof window !== 'undefined' && !!getToken()

  if (loading) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center text-sm text-muted-foreground">
        Loading bookmarks…
      </main>
    )
  }

  if (!bookmarks.length) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] flex-col">
        <OfferMarquee />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
          <p>No bookmarks yet.</p>
          <p className="max-w-sm text-foreground/50">
            {loggedIn
              ? 'Open a book and tap the bookmark icon to save it to this account.'
              : 'Save books while browsing. Log in later and they will merge into your account.'}
          </p>
          <Link href="/" className="text-foreground underline hover:no-underline">
            Browse books
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="home-shelf">
      <OfferMarquee />
      <div className="home-shelf-stage">
        <BooksShowcase
          books={bookmarks}
          heroTitle="Bookmarks"
          navTitle="Saved"
          className="h-full min-h-0 w-full"
        />
      </div>
    </main>
  )
}