'use client'

import Link from 'next/link'
import { useBookmarks } from '@/components/bookmarks-context'
import { BooksShowcase } from '@/components/ui/books-showcase'
import { getToken } from '@/lib/api'
import { useEffect, useState } from 'react'

export default function BookmarksPage() {
  const { bookmarks, loading } = useBookmarks()
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    setLoggedIn(!!getToken())
    const sync = () => setLoggedIn(!!getToken())
    window.addEventListener('auth-changed', sync)
    return () => window.removeEventListener('auth-changed', sync)
  }, [])

  return (
    <main className="relative z-0 w-full min-h-[calc(100vh-5rem)] pb-8">
      <div className="w-full h-[calc(100vh-5rem)] min-h-[560px]">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-foreground/50">
            Loading bookmarks…
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-foreground/60">
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
        ) : (
          <div className="flex h-full flex-col">
            {!loggedIn && (
              <p className="shrink-0 px-4 py-2 text-center text-xs text-foreground/50">
                Saved on this device only.{' '}
                <Link href="/login" className="font-medium text-sky-600 underline">
                  Log in
                </Link>{' '}
                to merge into your account.
              </p>
            )}
            <div className="min-h-0 flex-1">
              <BooksShowcase
                books={bookmarks}
                heroTitle="Bookmarks"
                navTitle={loggedIn ? 'Saved' : 'Saved on this device'}
                className="h-full w-full"
              />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}