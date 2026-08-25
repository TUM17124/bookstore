'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getOrder } from '@/lib/api'
import { getStoredUser } from '@/lib/auth-client'

const API = process.env.NEXT_PUBLIC_API_URL!

function SuccessInner() {
  const sp = useSearchParams()
  const orderId = sp.get('order') || ''

  const [status, setStatus] = useState('loading')
  const [email, setEmail] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [error, setError] = useState('')

  // Resolve email: URL → sessionStorage → logged-in user
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
    setStatus('loading')
    setError('')
    getOrder(orderId, email)
      .then((o) => setStatus((o as { status: string }).status))
      .catch(() => {
        setStatus('error')
        setError('Could not verify this order with that email.')
      })
  }, [orderId, email])

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

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Thank you</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Order #{orderId || '—'}
        {status !== 'need_email' && status !== 'loading' ? ` — status: ${status}` : null}
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
        <a
          href={downloadUrl}
          className="mt-6 inline-flex rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
        >
          Download your file
        </a>
      )}

      <p className="mt-6">
        <Link href="/" className="text-sm underline">
          Back home
        </Link>
      </p>
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