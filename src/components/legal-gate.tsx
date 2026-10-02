'use client'

import { useCallback, useEffect, useState } from 'react'
import { getToken } from '@/lib/api'
import {
  acceptLegal,
  getLegalStatus,
  needsLegalAccept,
} from '@/lib/legal'
import { useAsyncAction } from '@/hooks/use-async-action'
import { ActionButton } from '@/components/ui/action-button'

export function LegalGate() {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState('')

  const checkLegal = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setOpen(false)
      return
    }

    try {
      const data = await getLegalStatus(token)
      if (needsLegalAccept(data)) {
        setSummary(
          data.legal_change_summary ||
            data.summary ||
            'We updated our terms. Accept to continue.',
        )
        setOpen(true)
      } else {
        setOpen(false)
      }
    } catch {
      // Do not block the app if status fails.
    }
  }, [])

  useEffect(() => {
    checkLegal()
    window.addEventListener('auth-changed', checkLegal)
    return () => window.removeEventListener('auth-changed', checkLegal)
  }, [checkLegal])

  // Idempotent server-side: retried with ONE key on connection problems.
  const accept = useAsyncAction((ctx) => acceptLegal(getToken() || '', ctx), {
    successMs: 0,
    errorFallback: 'Unable to accept the legal terms. Please try again.',
    onSuccess: () => {
      setOpen(false)
      window.dispatchEvent(new Event('auth-changed'))
    },
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="mx-auto w-full max-w-md space-y-4 rounded-2xl border bg-background p-5 shadow-xl">
        <div>
          <h2 className="text-lg font-bold">Updated legal terms</h2>
          <p className="mt-2 text-sm text-foreground/70">{summary}</p>
        </div>

        <p className="text-sm text-foreground/70">
          Please review the updated{' '}
          <a className="underline" href="/terms/" target="_blank" rel="noopener noreferrer">
            Terms &amp; Conditions
          </a>
          {', '}
          <a className="underline" href="/terms-of-use/" target="_blank" rel="noopener noreferrer">
            Terms of Use
          </a>
          {', '}
          <a className="underline" href="/privacy/" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          {' and '}
          <a className="underline" href="/refund-policy/" target="_blank" rel="noopener noreferrer">
            Refund Policy
          </a>
          .
        </p>

        <ActionButton
          action={accept}
          onClick={() => getToken() && void accept.run()}
          loadingLabel="Saving…"
          errorClassName="text-sm text-red-500"
          className="w-full rounded-lg bg-foreground py-2 text-background disabled:opacity-50 aria-busy:opacity-80"
        >
          I have read and accept
        </ActionButton>
      </div>
    </div>
  )
}