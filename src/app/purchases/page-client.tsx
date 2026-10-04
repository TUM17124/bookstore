'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LegalOverlay } from '@/components/legal-overlay'
import { getPurchases, downloadBook, type PurchaseItem } from '@/lib/api'
import { PdfReader } from '@/components/pdf-reader'
import { AudioPlayer } from '@/components/audio-player'
import { GuestLinkRequestForm } from '@/components/guest-link-request-form'
import { useLoggedIn } from '@/lib/use-logged-in'
import { useAsyncAction } from '@/hooks/use-async-action'
import { ActionButton } from '@/components/ui/action-button'
import { useText } from '@/lib/site-config'

function Row({
  p,
  onRead,
  onListen,
}: {
  p: PurchaseItem
  onRead?: () => void
  onListen?: () => void
}) {
  const isAudio = p.product_type === 'audiobook'
  // Server re-checks purchase, downloadable flag and download limit. Never
  // auto-retried: each completed download counts toward the limit.
  const download = useAsyncAction(
    () => downloadBook(p.book_id, isAudio ? 'audiobook' : 'ebook', `book-${p.book_id}.${isAudio ? 'mp3' : 'pdf'}`),
    { errorFallback: 'Download failed. Please try again.' },
  )

  const original = useAsyncAction(
    () => downloadBook(p.book_id, 'ebook', `book-${p.book_id}.${p.original_format}`, null, 'original'),
    { errorFallback: 'Download failed. Please try again.' },
  )

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-foreground/10 px-3 py-2 text-sm">
      <Link
        href={`/?book=${encodeURIComponent(p.book_id)}`}
        className="font-medium underline"
      >
        Book #{p.book_id}
      </Link>
      <span className="flex flex-wrap items-center gap-2">
        {isAudio ? (
          <button
            type="button"
            onClick={onListen}
            className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background"
          >
            Listen
          </button>
        ) : (
          <button
            type="button"
            onClick={onRead}
            className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background"
          >
            Read
          </button>
        )}
        {p.downloadable === false ? (
          <span className="text-xs font-semibold text-foreground/40">Download off</span>
        ) : (
          <ActionButton
            action={download}
            onClick={() => void download.run()}
            compact
            loadingLabel="Downloading…"
            successLabel="Downloaded"
            errorPlacement="none"
            className="rounded-full border border-foreground/20 px-3 py-[3px] text-xs font-semibold disabled:opacity-50"
          >
            {p.original_format ? 'Download PDF' : 'Download'}
          </ActionButton>
        )}
        {!isAudio && p.downloadable !== false && p.original_format ? (
          <ActionButton
            action={original}
            onClick={() => void original.run()}
            compact
            loadingLabel="Downloading…"
            successLabel="Downloaded"
            errorPlacement="none"
            className="rounded-full border border-foreground/20 px-3 py-[3px] text-xs font-semibold disabled:opacity-50"
          >
            Original (.{p.original_format})
          </ActionButton>
        ) : null}
      </span>
      {download.errorText || original.errorText ? <p className="basis-full text-xs text-red-500" role="alert">{download.errorText || original.errorText}</p> : null}
    </li>
  )
}

export default function PurchasesPage() {
  // Django admin → Site: General → Empty pages / Purchases.
  const emptyEbooks = useText('empty.purchases_ebooks')
  const emptyAudio = useText('empty.purchases_audio')
  const guestTitle = useText('purchases.guest_title')
  const guestBody = useText('purchases.guest_body')
  const loggedIn = useLoggedIn()
  const [ebooks, setEbooks] = useState<PurchaseItem[]>([])
  const [audiobooks, setAudiobooks] = useState<PurchaseItem[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [reader, setReader] = useState<PurchaseItem | null>(null)
  const [player, setPlayer] = useState<PurchaseItem | null>(null)

  useEffect(() => {
    if (!loggedIn) return
    let cancelled = false
    // Authenticated: the server lists THIS account's purchases (it ignores
    // any other email when a login is present).
    getPurchases()
      .then((d) => {
        if (cancelled) return
        setEbooks(d.ebooks || [])
        setAudiobooks(d.audiobooks || [])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load purchases')
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [loggedIn])

  return (
    <>
      <LegalOverlay title="My purchases" updated="Your library">
        {!loggedIn ? (
          <>
            <p>
              <Link href="/login" className="underline">Log in</Link> to see the books in your account.
            </p>
            <h2>{guestTitle}</h2>
            <p>{guestBody}</p>
            <GuestLinkRequestForm />
          </>
        ) : (
          <>
            {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
            {busy ? <p className="mt-6 text-sm text-foreground/50">Loading…</p> : null}

            <h2>Ebooks</h2>
            <ul className="mt-2 space-y-2">
              {ebooks.map((p) => (
                <Row key={p.order_id} p={p} onRead={() => setReader(p)} />
              ))}
              {!busy && ebooks.length === 0 ? <li>{emptyEbooks}</li> : null}
            </ul>

            <h2>Audiobooks</h2>
            <ul className="mt-2 space-y-2">
              {audiobooks.map((p) => (
                <Row key={p.order_id} p={p} onListen={() => setPlayer(p)} />
              ))}
              {!busy && audiobooks.length === 0 ? <li>{emptyAudio}</li> : null}
            </ul>
          </>
        )}
      </LegalOverlay>

      {reader && (
        <div className="fixed inset-0 z-[10000] flex flex-col bg-background text-foreground">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-foreground/10 px-3">
            <button
              type="button"
              onClick={() => setReader(null)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-foreground/10"
            >
              ×
            </button>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
              Book #{reader.book_id}
            </p>
          </header>
          <PdfReader bookId={String(reader.book_id)} />
        </div>
      )}

      {player && (
        <div className="fixed inset-0 z-[10000] flex flex-col bg-background text-foreground">
          <AudioPlayer
            title={`Book #${player.book_id}`}
            bookId={String(player.book_id)}
            onClose={() => setPlayer(null)}
            downloadable={player.downloadable !== false}
          />
        </div>
      )}
    </>
  )
}
