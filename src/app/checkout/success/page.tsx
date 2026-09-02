'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getOrder, confirmOrderPayment, getPurchases, type PurchaseItem } from '@/lib/api'
import { getStoredUser } from '@/lib/auth-client'
import { PdfReader } from '@/components/pdf-reader'

const API = process.env.NEXT_PUBLIC_API_URL!

function readStoredBook() {
  if (typeof window === 'undefined') return { id: '', title: '' }
  return {
    id: (sessionStorage.getItem('checkout_book_id') || '').trim(),
    title: (sessionStorage.getItem('checkout_book_title') || '').trim(),
  }
}

function SuccessInner() {
  const sp = useSearchParams()
  const orderId = sp.get('order') || ''
  const reference = (sp.get('reference') || '').trim()
  const bookFromQuery = (sp.get('bookId') || sp.get('book') || '').trim()

  const [status, setStatus] = useState('loading')
  const [email, setEmail] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [error, setError] = useState('')
  const [readerOpen, setReaderOpen] = useState(false)
  const [productType, setProductType] = useState('')
  const [bookId, setBookId] = useState(bookFromQuery)
  const [bookTitle, setBookTitle] = useState('')
  const [purchases, setPurchases] = useState<{
    ebooks: PurchaseItem[]
    audiobooks: PurchaseItem[]
  }>({ ebooks: [], audiobooks: [] })

  useEffect(() => {
    const fromQuery = (sp.get('email') || '').trim().toLowerCase()
    const fromSession =
      typeof window !== 'undefined'
        ? (sessionStorage.getItem('checkout_email') || '').trim().toLowerCase()
        : ''
    const fromUser = (getStoredUser()?.email || '').trim().toLowerCase()
    const resolved = fromQuery || fromSession || fromUser
    setEmail(resolved)
    setEmailInput(resolved)

    const stored = readStoredBook()
    setBookId((prev) => prev || bookFromQuery || stored.id)
    setBookTitle((prev) => prev || stored.title)
  }, [sp, bookFromQuery])

  useEffect(() => {
    if (!orderId || !email) {
      if (orderId && !email) setStatus('need_email')
      return
    }

    let cancelled = false
    setStatus('loading')
    setError('')

    ;(async () => {
      try {
        if (reference) {
          await confirmOrderPayment(orderId, { reference, email })
        }
        const o = (await getOrder(orderId, email)) as {
          status: string
          product_type?: string
          book_id?: string | number
          title?: string
          book_title?: string
          book?: { id?: string | number; title?: string }
        }
        if (cancelled) return
        setStatus(o.status)
        setProductType(String(o.product_type || ''))
        const stored = readStoredBook()
        setBookId(
          String(o.book?.id || o.book_id || bookFromQuery || stored.id || ''),
        )
        setBookTitle(
          String(o.book?.title || o.book_title || o.title || stored.title || ''),
        )
        const list = await getPurchases(email)
        if (!cancelled) setPurchases(list)
      } catch {
        if (!cancelled) {
          const stored = readStoredBook()
          setBookId((prev) => prev || bookFromQuery || stored.id)
          setStatus('error')
          setError('Could not verify this order with that email.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [orderId, email, reference, bookFromQuery])

  function applyEmail(e: React.FormEvent) {
    e.preventDefault()
    const next = emailInput.trim().toLowerCase()
    if (!next) return
    sessionStorage.setItem('checkout_email', next)
    setEmail(next)
  }

  const downloadUrl =
    orderId && email && status === 'paid'
      ? `${API}/orders/${orderId}/download/?email=${encodeURIComponent(email)}`
      : null

  const readUrl = downloadUrl ? `${downloadUrl}&inline=1` : null
  const canRead = Boolean(readUrl && productType !== 'audiobook')
  const backHref = bookId ? `/?book=${encodeURIComponent(bookId)}` : '/'

  const allPurchases = [
    ...purchases.ebooks.map((p) => ({ ...p, kind: 'Ebook' })),
    ...purchases.audiobooks.map((p) => ({ ...p, kind: 'Audiobook' })),
  ]

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Thank you</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Order #{orderId || '—'}
        {status !== 'need_email' && status !== 'loading' ? ` — status: ${status}` : null}
      </p>
      {bookTitle ? (
        <p className="mt-1 text-sm font-medium text-foreground/80">{bookTitle}</p>
      ) : null}

      {status === 'loading' && (
        <p className="mt-6 text-sm text-foreground/50">Confirming your order…</p>
      )}

      {status === 'need_email' && (
        <form onSubmit={applyEmail} className="mt-8 text-left">
          <p className="text-sm text-foreground/60">
            Enter the same email you used at checkout to unlock your files.
          </p>
          <input
            type="email"
            required
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="name@example.com"
            className="mt-3 w-full rounded-xl border border-foreground/15 bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500/30"
          />
          <button
            type="submit"
            className="mt-3 w-full rounded-full bg-foreground py-2.5 text-sm font-semibold text-background"
          >
            Continue
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      {downloadUrl && (
        <div className="mt-6 flex flex-col items-center gap-3">
          {canRead && (
            <button
              type="button"
              onClick={() => setReaderOpen(true)}
              className="inline-flex rounded-full border border-foreground/20 px-6 py-3 text-sm font-semibold"
            >
              Read
            </button>
          )}
          <a
            href={downloadUrl}
            className="inline-flex rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
          >
            Download this file
          </a>
        </div>
      )}

      {email && allPurchases.length > 0 && (
        <section className="mt-10 text-left">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/40">
            Your purchases
          </h2>
          <ul className="mt-3 space-y-2">
            {allPurchases.map((p) => (
              <li
                key={`${p.kind}-${p.order_id}`}
                className="flex items-center justify-between rounded-xl border border-foreground/10 px-3 py-2 text-sm"
              >
                <Link
                  href={`/?book=${p.book_id}`}
                  className="min-w-0 truncate font-medium hover:underline"
                >
                  {p.kind} · book #{p.book_id}
                </Link>
                <a
                  href={`${API}/orders/${p.order_id}/download/?email=${encodeURIComponent(email)}`}
                  className="shrink-0 text-xs font-semibold underline"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-xs text-foreground/45">
            <Link href="/purchases" className="underline">
              Open full purchase list
            </Link>
          </p>
        </section>
      )}

      <p className="mt-8">
        <Link
          href={backHref}
          className="inline-flex rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
        >
          {bookId ? 'Back to the book' : 'Back home'}
        </Link>
      </p>

      {readerOpen && readUrl && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0b1020]">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-3">
            <button
              type="button"
              onClick={() => setReaderOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              ×
            </button>
            <p className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-white">
              {bookTitle || 'Reader'}
            </p>
          </header>
          <PdfReader url={readUrl} bookId={bookId || undefined} />
        </div>
      )}
    </main>
  )
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-foreground/50">Loading…</div>
      }
    >
      <SuccessInner />
    </Suspense>
  )
}