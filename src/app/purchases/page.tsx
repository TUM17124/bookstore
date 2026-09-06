'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LegalOverlay } from '@/components/legal-overlay'
import { getPurchases, downloadOrderUrl, type PurchaseItem } from '@/lib/api'
import { getStoredUser } from '@/lib/auth-client'
import { PdfReader } from '@/components/pdf-reader'
import { AudioPlayer } from '@/components/audio-player'

const COOLDOWN_MS = 8000

function Row({
  p,
  email,
  onRead,
  onListen,
}: {
  p: PurchaseItem
  email: string
  onRead?: () => void
  onListen?: () => void
}) {
  const isAudio = p.product_type === 'audiobook'
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
        <a
          href={downloadOrderUrl(p.order_id, email)}
          className="text-xs font-semibold underline"
        >
          Download
        </a>
      </span>
    </li>
  )
}

export default function PurchasesPage() {
  const [email, setEmail] = useState('')
  const [input, setInput] = useState('')
  const [ebooks, setEbooks] = useState<PurchaseItem[]>([])
  const [audiobooks, setAudiobooks] = useState<PurchaseItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reader, setReader] = useState<PurchaseItem | null>(null)
  const [player, setPlayer] = useState<PurchaseItem | null>(null)
  const lastLookup = useRef(0)

  useEffect(() => {
    const u =
      getStoredUser()?.email ||
      (typeof window !== 'undefined'
        ? localStorage.getItem('checkout_email') ||
          sessionStorage.getItem('checkout_email') ||
          ''
        : '')
    const e = u.trim().toLowerCase()
    if (e) {
      setEmail(e)
      setInput(e)
    }
  }, [])

  useEffect(() => {
    if (!email) return
    setBusy(true)
    setError('')
    getPurchases(email)
      .then((d) => {
        setEbooks(d.ebooks || [])
        setAudiobooks(d.audiobooks || [])
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not load purchases')
      })
      .finally(() => setBusy(false))
  }, [email])

  function onLookup(e: React.FormEvent) {
    e.preventDefault()
    const next = input.trim().toLowerCase()
    if (!next) return
    const now = Date.now()
    if (now - lastLookup.current < COOLDOWN_MS) {
      setError('Please wait a few seconds before searching again.')
      return
    }
    lastLookup.current = now
    sessionStorage.setItem('checkout_email', next)
    localStorage.setItem('checkout_email', next)
    setEmail(next)
  }

  return (
    <>
      <LegalOverlay title="My purchases" updated="Use checkout email">
        <p>
          Use the email from checkout. Open a title to return to that book on the
          shelf. Close with X to go back.
        </p>

        <form className="mt-4 flex gap-2" onSubmit={onLookup}>
          <input
            type="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="email used at checkout"
            className="min-w-0 flex-1 rounded-xl border border-foreground/15 bg-transparent px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background"
          >
            Load
          </button>
        </form>

        {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
        {busy ? <p className="mt-6 text-sm text-foreground/50">Loading…</p> : null}

        <h2>Ebooks</h2>
        <ul className="mt-2 space-y-2">
          {ebooks.map((p) => (
            <Row key={p.order_id} p={p} email={email} onRead={() => setReader(p)} />
          ))}
          {!busy && ebooks.length === 0 ? <li>No ebook purchases yet.</li> : null}
        </ul>

        <h2>Audiobooks</h2>
        <ul className="mt-2 space-y-2">
          {audiobooks.map((p) => (
            <Row
              key={p.order_id}
              p={p}
              email={email}
              onListen={() => setPlayer(p)}
            />
          ))}
          {!busy && audiobooks.length === 0 ? (
            <li>No audiobook purchases yet.</li>
          ) : null}
        </ul>
      </LegalOverlay>

      {reader && email && (
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
          <PdfReader
            bookId={String(reader.book_id)}
            url={`${downloadOrderUrl(reader.order_id, email)}&inline=1`}
          />
        </div>
      )}

      {player && email && (
        <div className="fixed inset-0 z-[10000] flex flex-col bg-[#0b1020]">
          <AudioPlayer
            title={`Book #${player.book_id}`}
            bookId={String(player.book_id)}
            url={`${downloadOrderUrl(player.order_id, email)}&inline=1`}
            onClose={() => setPlayer(null)}
          />
        </div>
      )}
    </>
  )
}