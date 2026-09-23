'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
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

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold">{error || message}</p>
      {error ? (
        <Link href={safeNext(next || '/')} className="mt-4 text-sm underline">
          Return to what you were reading
        </Link>
      ) : null}
    </main>
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