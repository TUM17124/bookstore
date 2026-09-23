'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createCheckout, CheckoutError } from '@/lib/api'
import { getStoredUser, isLoggedIn } from '@/lib/auth-client'
import { getPromptContent, type PromptCopy } from '@/lib/prompts'

// Used only until the backend copy loads (or if it fails) — the editable
// version lives in Django admin under Site copy, slug "checkout-email-notice".
const FALLBACK_EMAIL_NOTICE: PromptCopy = {
  slug: 'checkout-email-notice',
  title: "You'll get a receipt by email",
  body: "After payment, we email a full receipt to the address above — the book, amount paid, and your Paystack transaction details. Keep it; it's what we use to sort out any payment dispute.",
}

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [legalRequired, setLegalRequired] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [emailNotice, setEmailNotice] = useState<PromptCopy>(FALLBACK_EMAIL_NOTICE)

  useEffect(() => {
    setMounted(true)
    setLoggedIn(isLoggedIn())
    const u = getStoredUser()
    if (u?.email) setEmail(u.email)
    rememberBook(bookId, title)
  }, [bookId, title])

  useEffect(() => {
    let cancelled = false
    getPromptContent('checkout-email-notice')
      .then((c) => {
        if (!cancelled && c) setEmailNotice(c)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const productLabel = type === 'ebook' ? 'ebook (PDF)' : 'audiobook'
  const checkoutPath = `/checkout?bookId=${bookId}&type=${type}&title=${encodeURIComponent(title)}`
  const signupHref = `/signup?email=${encodeURIComponent(email)}&next=${encodeURIComponent(checkoutPath)}`
  const loginHref = `/login?next=${encodeURIComponent(checkoutPath)}`

  async function onPay(e: React.FormEvent) {
    e.preventDefault()
    if (!bookId || !email.trim()) return
    if (!loggedIn && !termsAccepted) return
    setBusy(true)
    setError('')
    setLegalRequired(false)
    try {
      const trimmed = email.trim().toLowerCase()
      rememberBook(bookId, title, trimmed)

      const res = await createCheckout({
        book_id: Number(bookId),
        product_type: type,
        email: trimmed,
        terms_accepted: termsAccepted,
      })

      if (!res.checkout_url) {
        setError('No checkout URL returned')
        setBusy(false)
        return
      }

      sessionStorage.setItem('checkout_order_hint', String(res.order_id))

      let url = res.checkout_url
      try {
        const u = new URL(url, window.location.origin)
        if (u.pathname.includes('/checkout/success')) {
          u.searchParams.set('email', trimmed)
          if (bookId) u.searchParams.set('bookId', bookId)
          url = u.toString()
        }
      } catch {
        // hosted payment URL
      }

      window.location.href = url
    } catch (err) {
      if (err instanceof CheckoutError && err.legalRequired) {
        setLegalRequired(true)
      }
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/40">
        Checkout
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-foreground/55 capitalize">{productLabel}</p>

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
          className="mt-3 w-full rounded-xl border border-foreground/15 bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500/30"
        />

        <div className="mt-3 flex gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2.5">
          <span aria-hidden className="mt-0.5 text-foreground/40">
            ✉️
          </span>
          <p className="text-[13px] leading-relaxed text-foreground/60">
            <span className="font-medium text-foreground/80">{emailNotice.title}</span>{' '}
            {emailNotice.body}
          </p>
        </div>

        {mounted && !loggedIn && (
          <div className="mt-4 space-y-3 rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-4 py-4">
            <div>
              <p className="text-sm font-medium text-foreground/90">Guest checkout</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/60">
                You can pay with email only. Keep this address—it is how we match
                your payment if something goes wrong, and how we unlock downloads
                after you log in.
              </p>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-3">
              <p className="text-[13px] leading-relaxed text-foreground/70">
                Optional: create a free account with this same email to save
                bookmarks, leave reviews, and re-download later.
              </p>
              <Link
                href={signupHref}
                className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                Create a free account
              </Link>
              <p className="mt-3 text-center text-[12px] text-foreground/45">
                Already have an account?{' '}
                <Link
                  href={loginHref}
                  className="font-semibold text-sky-600 underline underline-offset-2 hover:text-sky-500 dark:text-sky-400"
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
          <p className="mt-4 text-[13px] text-foreground/50">
            You are signed in. Use your account email here so this payment stays
            linked for support and re-downloads.
          </p>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !email.trim() || (mounted && !loggedIn && !termsAccepted)}
          className="mt-6 w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background transition hover:bg-foreground/90 disabled:opacity-50"
        >
          {busy ? 'Redirecting…' : 'Continue to payment'}
        </button>

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