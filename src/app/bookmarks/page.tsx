'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useBookmarks } from '@/components/bookmarks-context'
import { BooksShowcase } from '@/components/ui/books-showcase'
import { OfferMarquee } from '@/components/offer-marquee'
import { getToken } from '@/lib/api'

export default function BookmarksPage() {
  const { bookmarks, loading } = useBookmarks()
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    setLoggedIn(!!getToken())
    const sync = () => setLoggedIn(!!getToken())
    window.addEventListener('auth-changed', sync)
    return () => window.removeEventListener('auth-changed', sync)
  }, [])

  if (loading) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center text-sm text-foreground/50">
        Loading bookmarks…
      </main>
    )
  }

  if (bookmarks.length === 0) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] flex-col">
        <OfferMarquee />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-foreground/60">
          <p>No bookmarks yet. Save a book from the detail panel.</p>
          {!loggedIn && (
            <p className="max-w-sm text-foreground/45">
              Guest saves stay on this device.{' '}
              <Link href="/login" className="font-semibold text-sky-600 underline">
                Log in
              </Link>{' '}
              to sync them to your account.
            </p>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="home-shelf">
      <OfferMarquee />
      {!loggedIn && (
        <p className="shrink-0 px-4 py-2 text-center text-xs text-foreground/50">
          Saved on this device only.{' '}
          <Link href="/login" className="font-medium text-sky-600 underline">
            Log in
          </Link>{' '}
          to merge into your account.
        </p>
      )}
      <div className="home-shelf-stage">
        <BooksShowcase
          books={bookmarks}
          heroTitle="Bookmarks"
          navTitle={loggedIn ? 'Saved' : 'Saved on this device'}
          className="h-full min-h-0 w-full"
        />
      </div>
    </main>
  )
}