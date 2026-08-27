'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getOrder, confirmOrderPayment } from '@/lib/api'
import { getStoredUser } from '@/lib/auth-client'

const API = process.env.NEXT_PUBLIC_API_URL!

function SuccessInner() {
  const sp = useSearchParams()
  const orderId = sp.get('order') || ''
  const reference = (sp.get('reference') || '').trim()

  const [status, setStatus] = useState('loading')
  const [email, setEmail] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [error, setError] = useState('')
  const [readerOpen, setReaderOpen] = useState(false)
  const [productType, setProductType] = useState('')

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
  }, [sp])

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
        const o = await getOrder(orderId, email)
        if (!cancelled) {
          setStatus((o as { status: string }).status)
          setProductType(String((o as { product_type?: string }).product_type || ''))
        }
      } catch {
        if (!cancelled) {
          setStatus('error')
          setError('Could not verify this order with that email.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [orderId, email, reference])

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

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Thank you</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Order #{orderId || '—'}
        {status !== 'need_email' && status !== 'loading'
          ? ` — status: ${status}`
          : null}
      </p>

      {status === 'loading' && (
        <p className="mt-6 text-sm text-foreground/50">Confirming your order…</p>
      )}

      {status === 'need_email' && (
        <form onSubmit={applyEmail} className="mt-8 text-left">
          <p className="text-sm text-foreground/60">
            Enter the same email you used at checkout to unlock your download.
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
            Download your file
          </a>
          <p className="text-sm text-foreground/55">
            You can also open this book later and use{' '}
            <span className="font-medium text-foreground/80">Read</span>,{' '}
            <span className="font-medium text-foreground/80">Download</span> or{' '}
            <span className="font-medium text-foreground/80">Download audio</span>{' '}
            on the book page (same email).
          </p>
        </div>
      )}

      <p className="mt-6">
        <Link href="/" className="text-sm underline">
          Back home
        </Link>
      </p>

      {readerOpen && readUrl && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0b1020]">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-3">
            <button
              type="button"
              onClick={() => setReaderOpen(false)}
              aria-label="Close reader"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              ×
            </button>
            <p className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-white">
              PDF reader
            </p>
            <a
              href={downloadUrl!}
              className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0b1020]"
            >
              Download
            </a>
          </header>
          <iframe
            title="PDF reader"
            src={readUrl}
            className="min-h-0 w-full flex-1 border-0 bg-neutral-900"
          />
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