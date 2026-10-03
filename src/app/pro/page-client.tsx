'use client'

import { useMoney } from '@/lib/money'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  cancelProSubscription,
  getProPricing,
  getProStatus,
  subscribePro,
  confirmProPayment,
  type ProStatus,
  type ProPlanQuote,
  ProductPriceChangedError,
  type PromoQuote,
} from '@/lib/api'
import { broadcastAccountChange, isLoggedIn } from '@/lib/auth-client'
import { useAsyncAction } from '@/hooks/use-async-action'
import { PromoPrice } from '@/components/offers/promo-price'
import { noteServerTime } from '@/components/offers/countdown'
import { ActionButton } from '@/components/ui/action-button'
import { useFeature, useOffMessage, usePairs, useText } from '@/lib/site-config'

// Icons for the benefits, in order; the texts are admin-editable
// (Django admin → Site: General → Pro page benefits).
const BENEFIT_ICONS = [
  <svg key="popout" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" aria-hidden>
    <rect x="3" y="5" width="14" height="11" rx="1.5" />
    <path d="M13 12.5h6v6h-6z" fill="currentColor" stroke="none" />
  </svg>,
  <span key="voice" className="text-lg leading-none">🔊</span>,
]

/** "month" for 30 days, "year" for 365, otherwise "N days". */
function periodLabel(days: number) {
  if (days === 30 || days === 31) return 'month'
  if (days === 365 || days === 366) return 'year'
  if (days === 7) return 'week'
  return `${days} days`
}

function ProInner() {
  const money = useMoney()
  const sp = useSearchParams()
  const proRef = (sp.get('pro_ref') || '').trim()

  const [mounted, setMounted] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [price, setPrice] = useState('')
  const [quote, setQuote] = useState<PromoQuote | null>(null)
  const [plans, setPlans] = useState<ProPlanQuote[]>([])
  const [planCode, setPlanCode] = useState('')
  const [signupsOpen, setSignupsOpen] = useState(true)
  const headline = useText('pro.headline')
  const benefits = usePairs('pro.benefits')
  const signupsOn = useFeature('pro_signups')
  const signupsOffMessage = useOffMessage('pro_signups')
  const [pricingNonce, setPricingNonce] = useState(0)
  const [status, setStatus] = useState<ProStatus | null>(null)
  const [cancelConfirmed, setCancelConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [justSubscribed, setJustSubscribed] = useState(false)
  const planCodeRef = useRef('')
  const plan = plans.find((x) => x.code === planCode)
  const period = periodLabel(plan?.billing_days ?? 30)
  const canSubscribe = signupsOn && signupsOpen

  function choosePlan(next: ProPlanQuote) {
    planCodeRef.current = next.code
    setPlanCode(next.code)
    setPrice(next.price)
    setQuote(next.quote ?? null)
  }

  useEffect(() => {
    setMounted(true)
    setLoggedIn(isLoggedIn())
  }, [])

  // The price for THIS visitor (a promotion may be for some people only);
  // asked again on login/logout and when a promotion's countdown ends.
  useEffect(() => {
    let live = true
    getProPricing()
      .then((p) => {
        if (!live) return
        noteServerTime(p.server_now)
        const list = p.plans ?? []
        setPlans(list)
        setSignupsOpen(p.signups_open !== false)
        // Keep the visitor's choice when it is still on sale, else the first plan.
        const chosen = list.find((x) => x.code === planCodeRef.current) ?? list[0]
        if (chosen) {
          planCodeRef.current = chosen.code
          setPlanCode(chosen.code)
          setPrice(chosen.price)
          setQuote(chosen.quote ?? null)
        } else {
          setPrice(p.price_monthly === '0' ? '' : p.price_monthly)
          setQuote(p.quote ?? null)
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [pricingNonce, loggedIn])

  useEffect(() => {
    const again = () => {
      setLoggedIn(isLoggedIn())
      setPricingNonce((n) => n + 1)
    }
    window.addEventListener('auth-changed', again)
    return () => window.removeEventListener('auth-changed', again)
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

  // Payment initialisation: retried only with ONE idempotency key, so a
  // connection drop can't open two subscriptions / payment sessions.
  // The price shown is sent along: if it is no longer the price (a
  // promotion just started/ended or filled up), nothing is charged and the
  // new price is shown for the user to confirm with another press.
  const upgrade = useAsyncAction((ctx) => subscribePro(quote?.final_amount ?? (price || undefined), ctx, planCode || undefined), {
    successMs: 60_000, // "Redirecting…" while the browser leaves for Paystack
    errorFallback: 'Could not start checkout. Please try again.',
    onSuccess: (res) => {
      if (res?.checkout_url) window.location.href = res.checkout_url
    },
    onError: (err) => {
      if (err instanceof ProductPriceChangedError) setQuote(err.quote)
    },
  })

  const cancel = useAsyncAction(
    (ctx, subscriptionId: number) => cancelProSubscription(subscriptionId, ctx),
    {
      errorFallback: 'Could not cancel. Please try again.',
      onSuccess: () => {
        setCancelConfirmed(false)
        setStatus((cur) =>
          cur?.subscription ? { is_pro: false, subscription: { ...cur.subscription, status: 'cancelled' } } : cur,
        )
        broadcastAccountChange()
      },
    },
  )

  function handleCancel() {
    if (!status?.subscription?.id) return
    if (!cancelConfirmed) {
      setCancelConfirmed(true)
      return
    }
    void cancel.run(status.subscription.id)
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
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{headline}</h1>
        <div className="mt-3 flex justify-center text-foreground/60">
          {price ? (
            <PromoPrice
              quote={quote}
              fallback={price}
              suffix={` / ${period}`}
              onExpire={() => setPricingNonce((n) => n + 1)}
              className="items-center text-foreground"
            />
          ) : (
            'Loading price…'
          )}
        </div>
        {plans.length > 1 && (
          <div role="radiogroup" aria-label="Choose a plan" className="mt-5 flex flex-wrap justify-center gap-2">
            {plans.map((x) => (
              <button
                key={x.code}
                type="button"
                role="radio"
                aria-checked={x.code === planCode}
                onClick={() => choosePlan(x)}
                className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold transition ${
                  x.code === planCode
                    ? 'border-[#a3811f] bg-[#d4af37]/15 text-[#7a5f14]'
                    : 'border-foreground/15 text-foreground/70 hover:border-foreground/30'
                }`}
              >
                {x.name} · {money(x.quote?.final_amount ?? x.price)}
              </button>
            ))}
          </div>
        )}
        {plan?.description && <p className="mt-3 text-sm text-foreground/55">{plan.description}</p>}
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
        {benefits.map((b, i) => (
          <div key={`${i}-${b.label}`} className="flex items-start gap-3 rounded-xl border border-foreground/10 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d4af37]/15 text-[#a3811f]">
              {BENEFIT_ICONS[i] ?? <span className="text-base leading-none">★</span>}
            </span>
            <div>
              <p className="font-semibold">{b.label}</p>
              {b.value && <p className="mt-0.5 text-sm text-foreground/60">{b.value}</p>}
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
            <div className="mt-4 flex flex-col items-center gap-2">
              <Link href="/settings" className="text-sm underline text-foreground/70">
                Manage in Settings
              </Link>
              <ActionButton
                action={cancel}
                onClick={handleCancel}
                loadingLabel="Cancelling…"
                successLabel="Cancelled"
                errorClassName="text-sm text-red-600"
                className="rounded-lg border border-red-400 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {cancelConfirmed ? 'Tap again to confirm' : 'Cancel subscription'}
              </ActionButton>
              {cancelConfirmed && (
                <p className="text-xs text-foreground/50">
                  Your access continues until the end of the billing period.
                </p>
              )}
            </div>
          </div>
        ) : !canSubscribe ? (
          <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-5 text-center">
            <p className="font-semibold">Pro sign-ups are turned off</p>
            <p className="mt-1 text-sm text-foreground/70">{signupsOffMessage}</p>
          </div>
        ) : (
          <ActionButton
            action={upgrade}
            onClick={() => {
              setError('')
              void upgrade.run()
            }}
            disabled={!price}
            loadingLabel="Starting checkout…"
            successLabel="Redirecting…"
            errorClassName="mt-3 text-center text-sm text-red-700"
            className="w-full rounded-full bg-[#d4af37] px-4 py-3.5 text-center text-base font-bold text-[#3a2e08] disabled:opacity-60 aria-busy:opacity-80"
          >
            {`Upgrade to Pro — ${price ? money(quote?.final_amount ?? price) : '…'}/${period}`}
          </ActionButton>
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
