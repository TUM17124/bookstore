'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ContentError,
  clearGuestToken,
  downloadBook,
  getGuestLibrary,
  readGuestToken,
  storeGuestToken,
  type GuestLibrary,
  type GuestLibraryItem,
} from '@/lib/api'
import { PdfReader } from '@/components/pdf-reader'
import { AudioPlayer } from '@/components/audio-player'
import { GuestLinkRequestForm } from '@/components/guest-link-request-form'

/**
 * Guest (no-account) buyers land here from their emailed link
 * (/library/guest/?t=<token>). On first load the token is moved into
 * sessionStorage and stripped from the address bar, so it doesn't linger in
 * history, screenshots or Referer headers; after that it is only ever sent
 * as the X-Guest-Token header. The server decides everything shown here.
 */
function GuestLibraryInner() {
  const sp = useSearchParams()
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [lib, setLib] = useState<GuestLibrary | null>(null)
  const [error, setError] = useState<ContentError | Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [reading, setReading] = useState<GuestLibraryItem | null>(null)
  const [listening, setListening] = useState<GuestLibraryItem | null>(null)
  const [dlMsg, setDlMsg] = useState<Record<number, string>>({})

  // 1) capture + strip the token from the URL
  useEffect(() => {
    const fromUrl = (sp.get('t') || '').trim()
    if (fromUrl) {
      storeGuestToken(fromUrl)
      setToken(fromUrl)
      router.replace('/library/guest/')
      return
    }
    const stored = readGuestToken()
    setToken(stored)
    if (!stored) setLoading(false)
  }, [sp, router])

  // 2) load what this link unlocks
  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getGuestLibrary(token)
      .then((d) => {
        if (!cancelled) setLib(d)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error('Could not open your books.'))
        if (err instanceof ContentError && err.code === 'guest_link_invalid') clearGuestToken()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  function onAccessError(err: ContentError) {
    if (err.code === 'guest_link_expired' || err.code === 'guest_link_invalid') {
      setReading(null)
      setListening(null)
      setLib(null)
      setError(err)
    }
  }

  async function download(item: GuestLibraryItem) {
    if (!token) return
    setDlMsg((m) => ({ ...m, [item.order_id]: 'Preparing download…' }))
    try {
      await downloadBook(item.book.id, item.kind, `${item.book.title}.${item.kind === 'ebook' ? 'pdf' : 'mp3'}`, token)
      setDlMsg((m) => ({ ...m, [item.order_id]: '' }))
      getGuestLibrary(token).then(setLib).catch(() => {})
    } catch (err) {
      if (err instanceof ContentError) onAccessError(err)
      setDlMsg((m) => ({ ...m, [item.order_id]: err instanceof Error ? err.message : 'Download failed.' }))
    }
  }

  const expired = error instanceof ContentError && error.code === 'guest_link_expired'
  const invalid = !token || (error instanceof ContentError && error.code === 'guest_link_invalid')

  return (
    <main className="mx-auto max-w-lg px-4 py-14">
      <h1 className="text-2xl font-bold">Your books</h1>

      {loading ? <p className="mt-6 text-sm text-foreground/50">Opening your books…</p> : null}

      {!loading && (expired || invalid || (error && !lib)) ? (
        <section className="mt-6 rounded-2xl border border-foreground/10 p-5" role="alert">
          <p className="text-base font-semibold">
            {expired
              ? 'This link has expired — enter your email to get a new one.'
              : invalid
                ? 'This link isn’t valid — enter your email to get a new one.'
                : error?.message}
          </p>
          <p className="mt-1 text-sm text-foreground/60">
            Your purchases never expire — only the link does. We&apos;ll email a fresh link to the
            address you bought with.
          </p>
          <GuestLinkRequestForm autoFocus />
          <p className="mt-4 text-xs text-foreground/55">
            Still stuck? <a href="mailto:contact@plugyard.com" className="underline">Contact support</a>.
          </p>
        </section>
      ) : null}

      {!loading && lib ? (
        <>
          <p className="mt-2 text-sm text-foreground/60">
            Purchases for <strong>{lib.email}</strong>. This link works until{' '}
            <strong>{new Date(lib.expires_at).toLocaleString()}</strong>; after that, request a new
            one here with the same email — your books stay yours.
          </p>

          <ul className="mt-6 space-y-3">
            {lib.items.map((item) => (
              <li key={item.order_id} className="rounded-2xl border border-foreground/10 p-4">
                <p className="font-semibold">{item.book.title}</p>
                <p className="text-xs text-foreground/55">
                  {item.book.author ? `${item.book.author} · ` : ''}
                  {item.kind === 'ebook' ? 'Ebook' : 'Audiobook'} · Order #{item.order_id}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.can_read ? (
                    <button
                      type="button"
                      onClick={() => (item.kind === 'ebook' ? setReading(item) : setListening(item))}
                      className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background"
                    >
                      {item.kind === 'ebook' ? 'Read' : 'Listen'}
                    </button>
                  ) : (
                    <span className="text-xs text-foreground/50">Not available right now</span>
                  )}
                  {item.can_download ? (
                    <button
                      type="button"
                      onClick={() => void download(item)}
                      disabled={item.downloads_remaining <= 0}
                      className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      Download ({item.downloads_remaining} left)
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-foreground/45">
                      {item.kind === 'ebook' ? 'Read-only' : 'Streaming only'} — downloads are off for this book
                    </span>
                  )}
                </div>
                {dlMsg[item.order_id] ? (
                  <p className="mt-2 text-xs text-foreground/65" role="status">{dlMsg[item.order_id]}</p>
                ) : null}
              </li>
            ))}
            {lib.items.length === 0 ? (
              <li className="text-sm text-foreground/60">No books are available on this link.</li>
            ) : null}
          </ul>

          <section className="mt-8 rounded-2xl bg-foreground/[0.04] p-4 text-sm">
            <p className="font-semibold">Keep your books without links</p>
            <p className="mt-1 text-foreground/65">
              Create an account (or log in) with <strong>{lib.email}</strong> and these purchases
              move into your library automatically.
            </p>
            <p className="mt-2 flex gap-3">
              <Link href="/signup" className="font-semibold underline">Create an account</Link>
              <Link href="/login" className="font-semibold underline">Log in</Link>
            </p>
          </section>
        </>
      ) : null}

      {reading && token && (
        <div className="fixed inset-0 z-[10000] flex flex-col bg-[#0b1020]">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-3">
            <button
              type="button"
              onClick={() => setReading(null)}
              aria-label="Close reader"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              ×
            </button>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{reading.book.title}</p>
          </header>
          <PdfReader bookId={reading.book.id} guestToken={token} onAccessError={onAccessError} />
        </div>
      )}

      {listening && token && (
        <div className="fixed inset-0 z-[10000] flex flex-col bg-[#0b1020]">
          <AudioPlayer
            title={listening.book.title}
            bookId={listening.book.id}
            guestToken={token}
            onClose={() => setListening(null)}
            downloadable={listening.can_download}
            onAccessError={onAccessError}
          />
        </div>
      )}
    </main>
  )
}

export default function GuestLibraryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-foreground/50">Loading…</div>}>
      <GuestLibraryInner />
    </Suspense>
  )
}
