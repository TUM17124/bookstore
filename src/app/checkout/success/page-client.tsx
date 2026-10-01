'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getOrder, confirmOrderPayment, getToken, getBookAccess, downloadBook, requestGuestLink, type BookAccess } from '@/lib/api'
import { getStoredUser } from '@/lib/auth-client'
import { useLoggedIn } from '@/lib/use-logged-in'
import { PdfReader } from '@/components/pdf-reader'
import { useAsyncAction } from '@/hooks/use-async-action'
import { ActionButton, retryLabel } from '@/components/ui/action-button'

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
  const [readerOpen, setReaderOpen] = useState(false)
  const [productType, setProductType] = useState('')
  const [bookId, setBookId] = useState(bookFromQuery)
  const [bookTitle, setBookTitle] = useState('')
  const [access, setAccess] = useState<BookAccess | null>(null)
  const loggedIn = useLoggedIn()
  const [linkMsg, setLinkMsg] = useState('')


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

  // Confirming the payment with the server: retried on connection problems
  // with ONE idempotency key (the confirm endpoint replays its first answer),
  // and the user gets "Try again" if it still fails.
  const verify = useAsyncAction(
    async (ctx, oid: string, em: string, ref: string) => {
      if (ref) await confirmOrderPayment(oid, { reference: ref, email: em }, ctx)
      const o = (await getOrder(oid, em)) as {
        status: string
        product_type?: string
        book_id?: string | number
        title?: string
        book_title?: string
        book?: { id?: string | number; title?: string }
      }
      // Account holders: ask the server what this order unlocks. Guests
      // (no account) get their access link by email instead.
      const stored = readStoredBook()
      const bid = String(o.book?.id || o.book_id || bookFromQuery || stored.id || '')
      let a: BookAccess | null = null
      if (getToken() && bid && o.status === 'paid') {
        // Optional extra: without it the read/download buttons stay hidden.
        a = await getBookAccess(bid).catch(() => null)
      }
      return { o, bid, access: a }
    },
    {
      successMs: 0,
      errorFallback: 'Could not verify this order with that email.',
      onSuccess: (r) => {
        if (!r) return
        const stored = readStoredBook()
        setStatus(r.o.status)
        setProductType(String(r.o.product_type || ''))
        setBookId(r.bid)
        setBookTitle(String(r.o.book?.title || r.o.book_title || r.o.title || stored.title || ''))
        setAccess(r.access)
      },
      onError: () => {
        const stored = readStoredBook()
        setBookId((prev) => prev || bookFromQuery || stored.id)
        setStatus('error')
      },
    },
  )
  const runVerify = verify.run

  useEffect(() => {
    if (!orderId || !email) {
      if (orderId && !email) setStatus('need_email')
      return
    }
    setStatus('loading')
    void runVerify(orderId, email, reference)
  }, [orderId, email, reference, runVerify])

  const download = useAsyncAction(
    // Never auto-retried: each completed download counts toward the limit.
    (_ctx, bid: string, k: 'ebook' | 'audiobook') =>
      downloadBook(bid, k, `book-${bid}.${k === 'audiobook' ? 'mp3' : 'pdf'}`),
    { errorFallback: 'Download failed. Please try again.' },
  )

  // Sends an email: retried with ONE idempotency key, so never twice.
  const sendLink = useAsyncAction((ctx, em: string) => requestGuestLink(em, ctx), {
    successMs: 3000,
    errorFallback: 'Could not send a new link. Try again.',
    onSuccess: (m) => setLinkMsg(m ?? ''),
  })

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
        <p className="mt-6 text-sm text-foreground/50" role="status" aria-live="polite">
          {verify.state === 'retrying' ? retryLabel(verify.retry) : 'Confirming your order…'}
        </p>
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

      {status === 'error' && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <ActionButton
            action={verify}
            onClick={() => void verify.run(orderId, email, reference)}
            loadingLabel="Checking…"
            errorLabel="Try again"
            errorClassName="text-sm text-red-500"
            className="rounded-full border border-foreground/20 px-5 py-2 text-sm font-semibold"
          >
            Try again
          </ActionButton>
        </div>
      )}

      {status === 'paid' && !loggedIn && (
        <section className="mt-6 rounded-2xl border border-foreground/10 p-4 text-left text-sm">
          <p className="font-semibold">Check your email</p>
          <p className="mt-1 text-foreground/65">
            We&apos;ve sent a secure link to <strong>{email}</strong>. Open it to read, listen
            or download (as the author allows). Your purchase never expires — only the link does,
            and you can always get a new one.
          </p>
          <ActionButton
            action={sendLink}
            onClick={() => email && void sendLink.run(email)}
            disabled={!email}
            loadingLabel="Sending…"
            successLabel="Sent"
            errorClassName="mt-2 text-xs text-red-500"
            className="mt-3 rounded-full border border-foreground/20 px-4 py-2 text-xs font-semibold disabled:opacity-50"
          >
            Didn&apos;t get it? Send a new access link
          </ActionButton>
          {linkMsg && sendLink.state !== 'error' ? (
            <p className="mt-2 text-xs text-foreground/60" role="status">{linkMsg}</p>
          ) : null}
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
            <ActionButton
              action={download}
              onClick={() => bookId && void download.run(bookId, kind)}
              loadingLabel="Downloading…"
              successLabel="Downloaded"
              errorClassName="text-sm text-red-500"
              className="inline-flex rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background disabled:opacity-50"
            >
              Download this file
            </ActionButton>
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