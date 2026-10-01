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
            className="rounded-full bg-[#141a32] px-3 py-1 text-xs font-semibold text-[#fdfbf4]"
          >
            Listen
          </button>
        ) : (
          <button
            type="button"
            onClick={onRead}
            className="rounded-full bg-[#141a32] px-3 py-1 text-xs font-semibold text-[#fdfbf4]"
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
            loadingLabel="Downloading…"
            successLabel="Downloaded"
            errorPlacement="none"
            className="text-xs font-semibold underline disabled:opacity-50"
          >
            Download
          </ActionButton>
        )}
      </span>
      {download.errorText ? <p className="basis-full text-xs text-red-500" role="alert">{download.errorText}</p> : null}
    </li>
  )
}

export default function PurchasesPage() {
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
            <h2>Bought without an account?</h2>
            <p>
              Enter the email you used at checkout and we&apos;ll email you a fresh secure link to
              your books. Your purchases never expire — only the link does.
            </p>
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
              {!busy && ebooks.length === 0 ? <li>No ebook purchases yet.</li> : null}
            </ul>

            <h2>Audiobooks</h2>
            <ul className="mt-2 space-y-2">
              {audiobooks.map((p) => (
                <Row key={p.order_id} p={p} onListen={() => setPlayer(p)} />
              ))}
              {!busy && audiobooks.length === 0 ? <li>No audiobook purchases yet.</li> : null}
            </ul>
          </>
        )}
      </LegalOverlay>

      {reader && (
        <div className="fixed inset-0 z-[10000] flex flex-col bg-[#0b1020]">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-3">
            <button
              type="button"
              onClick={() => setReader(null)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10"
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
        <div className="fixed inset-0 z-[10000] flex flex-col bg-[#0b1020]">
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
