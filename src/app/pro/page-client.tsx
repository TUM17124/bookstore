'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  getProPricing,
  getProStatus,
  subscribePro,
  confirmProPayment,
  type ProStatus,
} from '@/lib/api'
import { isLoggedIn } from '@/lib/auth-client'

const BENEFITS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" aria-hidden>
        <rect x="3" y="5" width="14" height="11" rx="1.5" />
        <path d="M13 12.5h6v6h-6z" fill="currentColor" stroke="none" />
      </svg>
    ),
    title: 'Floating pop-out reader & player',
    body: 'Keep your page or your audiobook floating above other tabs and windows while you do something else, on desktop.',
  },
  {
    icon: <span className="text-lg leading-none">🔊</span>,
    title: 'AI narration, any page',
    body: 'Have any page read aloud in a natural voice — pick from four distinct voices, control speed, and follow along with auto-scroll and sentence highlighting as it reads.',
  },
]

function ProInner() {
  const sp = useSearchParams()
  const proRef = (sp.get('pro_ref') || '').trim()

  const [mounted, setMounted] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [price, setPrice] = useState('')
  const [status, setStatus] = useState<ProStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [justSubscribed, setJustSubscribed] = useState(false)

  useEffect(() => {
    setMounted(true)
    setLoggedIn(isLoggedIn())
    getProPricing()
      .then((p) => setPrice(p.price_monthly))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!mounted || !loggedIn) return
    let cancelled = false

    ;(async () => {
      if (proRef) {
        setConfirming(true)
        try {
          const res = await confirmProPayment(proRef)
          if (!cancelled && res.ok && res.paid) setJustSubscribed(true)
        } catch {
          // fall through — status refresh below still runs
        }
        if (!cancelled) setConfirming(false)
      }
      try {
        const s = await getProStatus()
        if (!cancelled) setStatus(s)
      } catch {
        // leave status null — treated as "free" below
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mounted, loggedIn, proRef])

  async function handleUpgrade() {
    setBusy(true)
    setError('')
    try {
      const res = await subscribePro()
      window.location.href = res.checkout_url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout')
      setBusy(false)
    }
  }

  const isPro = !!status?.is_pro
  const nextPath = '/pro'
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`
  const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d4af37]/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#a3811f]">
          ★ PlugYard Pro
        </span>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Read and listen without limits</h1>
        <p className="mt-3 text-foreground/60">
          {price ? (
            <>
              <span className="text-2xl font-extrabold text-foreground">
                KES {Number(price).toLocaleString()}
              </span>
              <span className="text-sm"> / month</span>
            </>
          ) : (
            'Loading price…'
          )}
        </p>
      </div>

      {justSubscribed && (
        <p className="mt-8 rounded-xl border border-emerald-400 bg-emerald-400/10 p-4 text-center text-sm font-semibold text-emerald-700">
          You&apos;re on Pro. Enjoy the pop-out reader and AI narration.
        </p>
      )}
      {confirming && (
        <p className="mt-8 rounded-xl border border-foreground/10 p-4 text-center text-sm text-foreground/60">
          Confirming your payment…
        </p>
      )}

      <div className="mt-8 space-y-4">
        {BENEFITS.map((b) => (
          <div key={b.title} className="flex items-start gap-3 rounded-xl border border-foreground/10 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d4af37]/15 text-[#a3811f]">
              {b.icon}
            </span>
            <div>
              <p className="font-semibold">{b.title}</p>
              <p className="mt-0.5 text-sm text-foreground/60">{b.body}</p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-6 rounded-lg border border-red-400 p-3 text-center text-sm text-red-700">{error}</p>
      )}

      <div className="mt-8">
        {!mounted ? null : !loggedIn ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-foreground/60">Log in or create an account to upgrade.</p>
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Link
                href={loginHref}
                className="flex-1 rounded-full border border-foreground/15 px-4 py-3 text-center text-sm font-semibold"
              >
                Log in
              </Link>
              <Link
                href={signupHref}
                className="flex-1 rounded-full bg-foreground px-4 py-3 text-center text-sm font-semibold text-background"
              >
                Sign up
              </Link>
            </div>
          </div>
        ) : isPro ? (
          <div className="rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 p-5 text-center">
            <p className="font-bold text-[#a3811f]">★ You&apos;re on Pro</p>
            <p className="mt-1 text-sm text-foreground/60">
              {status?.subscription?.expires_at
                ? `Renews or expires on ${new Date(
                    status.subscription.expires_at,
                  ).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.`
                : 'Your subscription is active.'}
            </p>
            <Link href="/settings" className="mt-3 inline-block text-sm underline text-foreground/70">
              Manage in Settings
            </Link>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleUpgrade()}
            disabled={busy || !price}
            className="w-full rounded-full bg-[#d4af37] px-4 py-3.5 text-center text-base font-bold text-[#3a2e08] disabled:opacity-60"
          >
            {busy ? 'Starting checkout…' : `Upgrade to Pro — KES ${price ? Number(price).toLocaleString() : '…'}/month`}
          </button>
        )}
      </div>
    </main>
  )
}

export default function ProPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-foreground/50">
          Loading…
        </div>
      }
    >
      <ProInner />
    </Suspense>
  )
}
