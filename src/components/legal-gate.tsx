'use client'

import { useCallback, useEffect, useState } from 'react'
import { getToken } from '@/lib/api'
import {
  acceptLegal,
  getLegalStatus,
  needsLegalAccept,
} from '@/lib/legal'

export function LegalGate() {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

  if (!open) return null

  async function handleAccept() {
    const token = getToken()
    if (!token) return

    setBusy(true)
    setError('')

    try {
      await acceptLegal(token)
      setOpen(false)
      window.dispatchEvent(new Event('auth-changed'))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to accept the legal terms.',
      )
    } finally {
      setBusy(false)
    }
  }

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

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="button"
          disabled={busy}
          onClick={handleAccept}
          className="w-full rounded-lg bg-black py-2 text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'I have read and accept'}
        </button>
      </div>
    </div>
  )
}