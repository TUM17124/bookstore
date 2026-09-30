'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getOrder, confirmOrderPayment, getToken, getBookAccess, downloadBook, requestGuestLink, type BookAccess } from '@/lib/api'
import { getStoredUser } from '@/lib/auth-client'
import { useLoggedIn } from '@/lib/use-logged-in'
import { PdfReader } from '@/components/pdf-reader'

function readStoredBook() {
  if (typeof window === 'undefined') return { id: '', title: '' }
  return {
    id: (
      localStorage.getItem('checkout_book_id') ||
      sessionStorage.getItem('checkout_book_id') ||
      ''
    ).trim(),
    title: (
      localStorage.getItem('checkout_book_title') ||
      sessionStorage.getItem('checkout_book_title') ||
      ''
    ).trim(),
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
  const [downloading, setDownloading] = useState(false)
  const [productType, setProductType] = useState('')
  const [bookId, setBookId] = useState(bookFromQuery)
  const [bookTitle, setBookTitle] = useState('')
  const [access, setAccess] = useState<BookAccess | null>(null)
  const loggedIn = useLoggedIn()
  const [linkMsg, setLinkMsg] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)


  useEffect(() => {
    const fromQuery = (sp.get('email') || '').trim().toLowerCase()
    const fromStore =
      typeof window !== 'undefined'
        ? (
            localStorage.getItem('checkout_email') ||
            sessionStorage.getItem('checkout_email') ||
            ''
          ).trim().toLowerCase()
        : ''
    const fromUser = (getStoredUser()?.email || '').trim().toLowerCase()
    const resolved = fromQuery || fromStore || fromUser
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
        // Account holders: ask the server what this order unlocks. Guests
        // (no account) get their access link by email instead.
        const bid = String(o.book?.id || o.book_id || bookFromQuery || stored.id || '')
        if (getToken() && bid && o.status === 'paid') {
          try {
            const a = await getBookAccess(bid)
            if (!cancelled) setAccess(a)
          } catch {
            // buttons stay hidden
          }
        }
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
    localStorage.setItem('checkout_email', next)
    setEmail(next)
  }

  const kind = productType === 'audiobook' ? 'audiobook' : 'ebook'
  const entry = access ? access[kind] : null
  const canRead = status === 'paid' && kind === 'ebook' && entry?.read === 'full'
  const canDownload = status === 'paid' && !!entry?.can_download
  const backHref = bookId ? `/?book=${encodeURIComponent(bookId)}` : '/'

  async function sendLink() {
    if (!email || linkBusy) return
    setLinkBusy(true)
    try {
      setLinkMsg(await requestGuestLink(email))
    } catch (err) {
      setLinkMsg(err instanceof Error ? err.message : 'Could not send a new link.')
    } finally {
      setLinkBusy(false)
    }
  }

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

      {status === 'paid' && !loggedIn && (
        <section className="mt-6 rounded-2xl border border-foreground/10 p-4 text-left text-sm">
          <p className="font-semibold">Check your email</p>
          <p className="mt-1 text-foreground/65">
            We&apos;ve sent a secure link to <strong>{email}</strong>. Open it to read, listen
            or download (as the author allows). Your purchase never expires — only the link does,
            and you can always get a new one.
          </p>
          <button
            type="button"
            disabled={linkBusy}
            onClick={() => void sendLink()}
            className="mt-3 rounded-full border border-foreground/20 px-4 py-2 text-xs font-semibold disabled:opacity-50"
          >
            {linkBusy ? 'Sending…' : "Didn't get it? Send a new access link"}
          </button>
          {linkMsg ? <p className="mt-2 text-xs text-foreground/60" role="status">{linkMsg}</p> : null}
          <p className="mt-3 text-xs text-foreground/55">
            <Link href="/signup" className="underline">Create an account</Link> or{' '}
            <Link href="/login" className="underline">log in</Link> with this email to keep your books in your library.
          </p>
        </section>
      )}

      {(canRead || canDownload) && (
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
          {canDownload && (
            <button
              type="button"
              disabled={downloading}
              onClick={async () => {
                if (downloading || !bookId) return
                setDownloading(true)
                setError('')
                try {
                  await downloadBook(bookId, kind, `book-${bookId}.${kind === 'audiobook' ? 'mp3' : 'pdf'}`)
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Download failed.')
                } finally {
                  setDownloading(false)
                }
              }}
              className="inline-flex rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background disabled:opacity-50"
            >
              {downloading ? 'Downloading…' : 'Download this file'}
            </button>
          )}
          <Link href="/purchases" className="text-xs underline text-foreground/55">Open your purchases</Link>
        </div>
      )}

      <p className="mt-8">
        <Link
          href={backHref}
          className="inline-flex rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
        >
          {bookId ? 'Back to the book' : 'Back home'}
        </Link>
      </p>

      {readerOpen && canRead && bookId && (
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
          <PdfReader bookId={bookId} />
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