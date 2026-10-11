'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PaymentResultCard } from '@/components/payment-result'
import { confirmTtsCredits, getTtsUsage } from '@/lib/api'
import { isLoggedIn } from '@/lib/auth-client'

function safeNext(raw: string) {
  const value = (raw || '').trim()
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.startsWith('/credits/paid')) return '/'
  return value
}

function CreditsPaidInner() {
  const sp = useSearchParams()
  const router = useRouter()
  const reference = (sp.get('tts_credits_ref') || sp.get('reference') || '').trim()
  const next = safeNext(sp.get('next') || '')

  const [message, setMessage] = useState('Confirming your credits…')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const stored = (() => {
      try {
        return sessionStorage.getItem('plugyard-return') || ''
      } catch {
        return ''
      }
    })()
    const dest = safeNext(next || stored || '/')

    ;(async () => {
      if (!isLoggedIn()) {
        const login = `/login?next=${encodeURIComponent(`/credits/paid?tts_credits_ref=${reference}&next=${dest}`)}`
        router.replace(login)
        return
      }
      if (!reference) {
        router.replace(dest)
        return
      }
      try {
        const res = await confirmTtsCredits(reference)
        if (cancelled) return
        if (res.ok) {
          try {
            await getTtsUsage()
          } catch {
            /* snapshot already returned on confirm */
          }
          try {
            sessionStorage.removeItem('plugyard-return')
          } catch {
            /* ignore */
          }
          setMessage('Credits added. Taking you back…')
          router.replace(dest)
          return
        }
        setError(res.error || 'Payment could not be confirmed yet.')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not confirm payment.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [reference, next, router])

  const back = safeNext(next || '/')
  if (error) {
    return (
      <PaymentResultCard
        kind="failed"
        title="We could not confirm your payment yet"
        action={{ href: back, label: 'Return to what you were reading' }}
      >
        <p>{error}</p>
        <p className="mt-2 text-foreground/55">
          If money left your account, your credits are added as soon as the payment is confirmed.
          You do not need to pay again.
        </p>
      </PaymentResultCard>
    )
  }
  return (
    <PaymentResultCard kind={message.startsWith('Credits added') ? 'success' : 'pending'} title={message} />
  )
}

export default function CreditsPaidPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-foreground/50">
          Confirming credits…
        </div>
      }
    >
      <CreditsPaidInner />
    </Suspense>
  )
}