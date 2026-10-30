'use client'

import { useCallback, useEffect, useState } from 'react'
import { getToken } from '@/lib/api'
import {
  policyHref,
  policyLabel,
  acceptLegal,
  getLegalStatus,
  getLegalPages,
  needsLegalAccept,
} from '@/lib/legal'
import { useAsyncAction } from '@/hooks/use-async-action'
import { ActionButton } from '@/components/ui/action-button'

export function LegalGate() {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState('')
  const [policies, setPolicies] = useState<{ slug: string; title: string }[]>([])
  const [policiesReady, setPoliciesReady] = useState(false)
  const [policyError, setPolicyError] = useState('')

  const checkLegal = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setOpen(false)
      return
    }

    try {
      const data = await getLegalStatus(token)
      if (needsLegalAccept(data)) {
        if (getToken() !== token) return
        setPoliciesReady(false)
        setPolicyError('')
        setSummary(
          data.legal_change_summary ||
            data.summary ||
            'We updated our terms. Accept to continue.',
        )
        setOpen(true)
        try {
          const result = await getLegalPages()
          if (getToken() !== token) return
          if (!Array.isArray(result.pages) || !result.pages.length) throw new Error('No published policies')
          setPolicies(result.pages.map((page: { slug: string; title: string }) => ({ slug: page.slug, title: page.title })))
          setPoliciesReady(true)
        } catch {
          setPolicyError('The published policies could not be loaded. Please try again before accepting.')
        }
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
      <div className="mx-auto max-h-[85dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border bg-background p-5 shadow-xl">
        <div>
          <h2 className="text-lg font-bold">Updated legal terms</h2>
          <p className="mt-2 text-sm text-foreground/70">{summary}</p>
        </div>

        <p className="text-sm text-foreground/70">Please review the current published policies before accepting.</p>
        {policiesReady ? <ul className="space-y-2 text-sm">{policies.map(policy => <li key={policy.slug}>
          <a className="underline" href={policyHref(policy.slug)} target="_blank" rel="noopener noreferrer">{policyLabel(policy)}</a>
        </li>)}</ul> : <p role={policyError ? 'alert' : 'status'} className="text-sm">{policyError || 'Loading published policies…'}</p>}
        {policyError && <button type="button" className="text-sm underline" onClick={() => void checkLegal()}>Try loading policies again</button>}

        <ActionButton
          action={accept}
          disabled={!policiesReady}
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
