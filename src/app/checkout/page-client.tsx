'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createCheckout, CheckoutError, getQuote, PriceChangedError, type PriceQuote } from '@/lib/api'
import { PriceTag } from '@/components/offers/price-tag'
import { noteServerTime } from '@/components/offers/countdown'
import { useMoney } from '@/lib/money'
import { useAsyncAction } from '@/hooks/use-async-action'
import { ActionButton } from '@/components/ui/action-button'
import { UserError } from '@/lib/user-error'
import { getStoredUser, isLoggedIn } from '@/lib/auth-client'
import { useFeature, useOffMessage, useText } from '@/lib/site-config'

function rememberBook(bookId: string, title: string, email?: string) {
  if (typeof window === 'undefined') return
  if (bookId) {
    sessionStorage.setItem('checkout_book_id', bookId)
    localStorage.setItem('checkout_book_id', bookId)
  }
  if (title) {
    sessionStorage.setItem('checkout_book_title', title)
    localStorage.setItem('checkout_book_title', title)
  }
  if (email) {
    sessionStorage.setItem('checkout_email', email)
    localStorage.setItem('checkout_email', email)
  }
}

function CheckoutInner() {
  const sp = useSearchParams()
  const router = useRouter()

  const bookId = sp.get('bookId') || ''
  const type = (sp.get('type') === 'audiobook' ? 'audiobook' : 'ebook') as
    | 'ebook'
    | 'audiobook'
  const title = sp.get('title') || 'Your book'
  const canceled = sp.get('canceled') === '1'

  const [email, setEmail] = useState('')
  const [legalRequired, setLegalRequired] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  // Admin-editable texts (Django admin → Site: General → Checkout).
  const emailTitle = useText('checkout.email_title')
  const emailBody = useText('checkout.email_body')
  const guestHeading = useText('checkout.guest_heading')
  const guestWhy = useText('checkout.guest_why')
  const accountTip = useText('checkout.account_tip')
  const accountLinked = useText('checkout.account_linked')
  const freeTitle = useText('checkout.free_title')
  const freeBody = useText('checkout.free_body')
  // Site: Features → guest checkout. The server refuses it too.
  const guestCheckoutOn = useFeature('guest_checkout')
  const guestCheckoutOff = useOffMessage('guest_checkout')
  // Part C: the server's price for this book right now (offer included).
  const [quote, setQuote] = useState<PriceQuote | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [priceNotice, setPriceNotice] = useState('')
  const [quoteNonce, setQuoteNonce] = useState(0)
  const money = useMoney()
  // A free book never needs checkout (the site offers Read/Download), but a
  // direct link here must not offer to "Pay KES 0".
  const isFree = !!quote && Number(quote.list_price) <= 0 && Number(quote.price) <= 0

  useEffect(() => {
    setMounted(true)
    setLoggedIn(isLoggedIn())
    const u = getStoredUser()
    if (u?.email) setEmail(u.email)
    rememberBook(bookId, title)
  }, [bookId, title])

  useEffect(() => {
    if (!bookId) return
    const ctrl = new AbortController()
    getQuote(bookId, type, { signal: ctrl.signal })
      .then((q) => {
        noteServerTime(q.server_now)
        setQuote(q)
        setQuoteError('')
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setQuoteError("Couldn't load the price. Check your connection and try again.")
      })
    return () => ctrl.abort()
  }, [bookId, type, quoteNonce])

  // The offer's countdown reached zero: ask the server for the price again
  // and say so, so nobody pays without seeing the new price.
  const onOfferEnded = () => {
    setPriceNotice('The offer has ended. The price below is now the normal price.')
    setQuoteNonce((n) => n + 1)
  }

  const productLabel = type === 'ebook' ? 'ebook (PDF)' : 'audiobook'
  const checkoutPath = `/checkout?bookId=${bookId}&type=${type}&title=${encodeURIComponent(title)}`
  const signupHref = `/signup?email=${encodeURIComponent(email)}&next=${encodeURIComponent(checkoutPath)}`
  const loginHref = `/login?next=${encodeURIComponent(checkoutPath)}`

  // Retried automatically on connection problems with ONE idempotency key per
  // attempt, so the server never creates a second order or payment session.
  const pay = useAsyncAction(
    async (ctx, trimmed: string, accepted: boolean) => {
      rememberBook(bookId, title, trimmed)
      const res = await createCheckout(
        {
          book_id: Number(bookId),
          product_type: type,
          email: trimmed,
          terms_accepted: accepted,
          // The price shown here; the server won't charge a different one.
          expected_amount: quote?.price,
        },
        ctx,
      )
      if (!res.checkout_url) throw new UserError('No checkout URL returned. Please try again.')
      return res
    },
    {
      // Stays on "Redirecting…" while the browser leaves for Paystack.
      successMs: 60_000,
      errorFallback: 'Checkout failed. Please try again.',
      onSuccess: (res) => {
        if (!res) return
        sessionStorage.setItem('checkout_order_hint', String(res.order_id))
        let url = res.checkout_url
        try {
          const u = new URL(url, window.location.origin)
          if (u.pathname.includes('/checkout/success')) {
            u.searchParams.set('email', email.trim().toLowerCase())
            if (bookId) u.searchParams.set('bookId', bookId)
            url = u.toString()
          }
        } catch {
          // hosted payment URL
        }
        window.location.href = url
      },
      onError: (err) => {
        if (err instanceof CheckoutError && err.legalRequired) setLegalRequired(true)
        if (err instanceof PriceChangedError) {
          setQuote(err.quote)
          noteServerTime(err.quote.server_now)
          setPriceNotice(`The price changed to ${money(err.quote.price)}. Nothing was charged. Check it and press Pay again.`)
        }
      },
    },
  )

  function onPay(e: React.FormEvent) {
    e.preventDefault()
    if (!bookId || !email.trim()) return
    if (!loggedIn && (!termsAccepted || !guestCheckoutOn)) return
    setLegalRequired(false)
    void pay.run(email.trim().toLowerCase(), termsAccepted)
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/40">
        Checkout
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-foreground/55 capitalize">{productLabel}</p>

      {isFree ? (
        <div className="mt-6 rounded-3xl border border-emerald-500/25 bg-emerald-500/[0.06] p-6">
          <p className="text-lg font-bold">{freeTitle}</p>
          <p className="mt-1 text-sm text-foreground/70">{freeBody}</p>
          <Link
            href={`/?book=${encodeURIComponent(bookId)}`}
            className="mt-4 inline-flex min-h-[44px] items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background hover:bg-foreground/90"
          >
            Back to the book
          </Link>
        </div>
      ) : (
      <>
      <div className="mt-4 rounded-2xl border border-foreground/10 px-4 py-3" aria-live="polite">
        {quote ? (
          <PriceTag
            listPrice={Number(quote.list_price)}
            offer={quote.offer}
            size={quote.offer ? 'detail' : 'card'}
            onExpire={onOfferEnded}
            className="text-lg font-bold"
          />
        ) : quoteError ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {quoteError}{' '}
            <button type="button" className="font-semibold underline" onClick={() => setQuoteNonce((n) => n + 1)}>
              Try again
            </button>
          </p>
        ) : (
          <p className="text-sm text-foreground/50">Loading price…</p>
        )}
        {priceNotice && (
          <p role="status" className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
            {priceNotice}
          </p>
        )}
      </div>

      {canceled && (
        <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          Payment was canceled. You can try again when you are ready.
        </p>
      )}

      <form
        onSubmit={onPay}
        className="mt-8 rounded-3xl border border-foreground/10 bg-zinc-50/80 p-6 shadow-sm dark:bg-white/[0.03]"
      >
        <label
          htmlFor="checkout-email"
          className="block text-sm font-medium text-foreground/80"
        >
          Email address <span className="text-red-500">*</span>
        </label>
        <p className="mt-1 text-[13px] leading-relaxed text-foreground/50">
          This email{' '}
          <strong className="font-semibold text-foreground/75">
            links your payment to this order
          </strong>
          . Use it if you need help with a complaint, a failed payment, or a
          download problem. Sign in later with the{' '}
          <strong className="font-semibold text-foreground/75">same address</strong>{' '}
          to Read / Download or re-download audio without paying again. We do
          not use it for marketing.
        </p>
        <input
          id="checkout-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className="mt-3 w-full rounded-xl border border-foreground/15 bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/25"
        />

        <div className="mt-3 flex gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2.5">
          <span aria-hidden className="mt-0.5 text-foreground/40">
            ✉️
          </span>
          <p className="text-[13px] leading-relaxed text-foreground/60">
            <span className="font-medium text-foreground/80">{emailTitle}</span>{' '}
            {emailBody}
          </p>
        </div>

        {mounted && !loggedIn && !guestCheckoutOn && (
          <div role="status" className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-4">
            <p className="text-sm font-semibold text-foreground/90">Guest checkout is turned off</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/70">{guestCheckoutOff}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={loginHref}
                className="inline-flex items-center justify-center rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/90"
              >
                Log in
              </Link>
              <Link href={signupHref} className="inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold">
                Create a free account
              </Link>
            </div>
          </div>
        )}

        {mounted && !loggedIn && guestCheckoutOn && (
          <div className="mt-4 space-y-3 rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-4 py-4">
            <div>
              <p className="text-sm font-medium text-foreground/90">{guestHeading}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/60">
                <strong className="font-semibold text-foreground/80">Why we need your email:</strong>{' '}
                {guestWhy}
              </p>
            </div>
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-3">
              <p className="text-[13px] leading-relaxed text-foreground/70">{accountTip}</p>
              <Link
                href={signupHref}
                className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:bg-foreground/90"
              >
                Create a free account
              </Link>
              <p className="mt-3 text-center text-[12px] text-foreground/45">
                Already have an account?{' '}
                <Link
                  href={loginHref}
                  className="font-semibold text-foreground underline underline-offset-2 hover:text-foreground/80"
                >
                  Log in
                </Link>
              </p>
            </div>

            <label
              className={`flex items-start gap-2.5 rounded-xl border px-3 py-3 text-[13px] leading-relaxed ${
                legalRequired
                  ? 'border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-300'
                  : 'border-foreground/10 text-foreground/70'
              }`}
            >
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => {
                  setTermsAccepted(e.target.checked)
                  if (e.target.checked) setLegalRequired(false)
                }}
                required
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                I accept the{' '}
                <Link href="/terms" target="_blank" className="underline hover:text-foreground">
                  Terms &amp; Conditions
                </Link>
                ,{' '}
                <Link href="/terms-of-use" target="_blank" className="underline hover:text-foreground">
                  Terms of Use
                </Link>
                ,{' '}
                <Link href="/privacy" target="_blank" className="underline hover:text-foreground">
                  Privacy Policy
                </Link>
                , and{' '}
                <Link href="/refund-policy" target="_blank" className="underline hover:text-foreground">
                  Refund Policy
                </Link>
              </span>
            </label>
          </div>
        )}

        {mounted && loggedIn && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3">
            <span className="mt-px text-emerald-600 text-base" aria-hidden>✓</span>
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Signed in{email ? ` as ${email}` : ''}
              </p>
              <p className="mt-0.5 text-[13px] text-foreground/60">{accountLinked}</p>
            </div>
          </div>
        )}

        <ActionButton
          type="submit"
          action={pay}
          disabled={!email.trim() || !quote || (mounted && !loggedIn && (!termsAccepted || !guestCheckoutOn))}
          loadingLabel="Starting payment…"
          // After a price change the button offers the NEW price, not "Try again".
          errorLabel={pay.error instanceof PriceChangedError && quote ? `Pay ${money(quote.price)}` : undefined}
          successLabel="Redirecting…"
          errorClassName="mt-3 text-sm text-red-500"
          className="mt-6 w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background transition hover:bg-foreground/90 disabled:opacity-50 aria-busy:opacity-80"
        >
          {quote ? `Pay ${money(quote.price)}` : 'Continue to payment'}
        </ActionButton>
        <button
          type="button"
          onClick={() =>
            bookId
              ? router.push(`/?book=${encodeURIComponent(bookId)}`)
              : router.back()
          }
          className="mt-3 w-full text-center text-sm text-foreground/50 hover:text-foreground"
        >
          Cancel
        </button>
      </form>
      </>
      )}

      <p className="mt-6 text-center text-[12px] text-foreground/40">
        By continuing you agree to our{' '}
        <Link href="/terms" className="underline hover:text-foreground/70">
          Terms
        </Link>
        ,{' '}
        <Link href="/privacy" className="underline hover:text-foreground/70">
          Privacy
        </Link>{' '}
        and{' '}
        <Link href="/refund-policy" className="underline hover:text-foreground/70">
          Refund Policy
        </Link>
        .
      </p>
    </main>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-foreground/50">
          Loading checkout…
        </div>
      }
    >
      <CheckoutInner />
    </Suspense>
  )
}