'use client'

import { useCallback, useEffect, useState } from 'react'
import { paymentHost, safePaymentUrl } from '@/lib/payment-handoff'

export type HandoffInfo = {
  /** What is being paid for, e.g. the book title or "Pro subscription". */
  what: string
  /** Already formatted, e.g. "KES 250". Optional. */
  amount?: string
}

type Active = HandoffInfo & { url: string }

/** How long the screen shows before the browser leaves, so it is readable. */
export const HANDOFF_DELAY_MS = 900
/** After this long we offer a manual link, in case the redirect is blocked. */
export const HANDOFF_SLOW_MS = 7000

export function PaymentHandoff({ active, onCancel }: { active: Active; onCancel: () => void }) {
  const [slow, setSlow] = useState(false)
  const host = paymentHost(active.url)

  useEffect(() => {
    const go = window.setTimeout(() => {
      window.location.href = active.url
    }, HANDOFF_DELAY_MS)
    const late = window.setTimeout(() => setSlow(true), HANDOFF_SLOW_MS)
    // Back button from the payment page restores this page from the cache:
    // drop the screen instead of showing "Redirecting…" forever.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) onCancel()
    }
    window.addEventListener('pageshow', onShow)
    return () => {
      window.clearTimeout(go)
      window.clearTimeout(late)
      window.removeEventListener('pageshow', onShow)
    }
  }, [active.url, onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-handoff-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 px-4 backdrop-blur"
    >
      <div className="w-full max-w-sm rounded-3xl border border-foreground/10 bg-background p-7 text-center shadow-xl">
        <div
          aria-hidden="true"
          className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-foreground/15 border-t-foreground motion-reduce:animate-none"
        />
        <h2 id="payment-handoff-title" className="mt-5 text-lg font-bold" aria-live="polite">
          Taking you to the payment page…
        </h2>
        <p className="mt-2 text-sm text-foreground/70">
          {active.what}
          {active.amount ? <span className="font-semibold"> · {active.amount}</span> : null}
        </p>
        <p className="mt-4 text-xs text-foreground/50">
          You will pay on {host}, our payment partner. We never see your card details. You come
          back here automatically when you are done.
        </p>
        {slow ? (
          <div className="mt-5 space-y-2" data-testid="handoff-slow">
            <p className="text-xs text-foreground/60">This is taking longer than usual.</p>
            <a
              href={active.url}
              className="inline-block rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background"
            >
              Open the payment page
            </a>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="mt-5 block w-full text-sm text-foreground/60 underline underline-offset-2"
        >
          Cancel and go back
        </button>
      </div>
    </div>
  )
}

/**
 * `start(url, info)` shows the hand-off screen and then sends the browser to
 * the payment page. Render `node` once near the top of the page.
 */
export function usePaymentHandoff() {
  const [active, setActive] = useState<Active | null>(null)
  const cancel = useCallback(() => setActive(null), [])
  const start = useCallback((url: string, info: HandoffInfo) => {
    const safe = safePaymentUrl(url, window.location.origin)
    if (!safe) return false
    setActive({ ...info, url: safe })
    return true
  }, [])
  const node = active ? <PaymentHandoff active={active} onCancel={cancel} /> : null
  return { start, cancel, node, active: active !== null }
}
