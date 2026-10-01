'use client'

import { useState, type FormEvent } from 'react'
import { requestGuestLink } from '@/lib/api'
import { useAsyncAction } from '@/hooks/use-async-action'
import { ActionButton, ActionStatus } from '@/components/ui/action-button'

/**
 * "Get a new access link" for guest (no-account) buyers. The server always
 * answers with the same message, whether or not the email bought anything,
 * so this can't be used to find out who purchased what.
 */
export function GuestLinkRequestForm({
  defaultEmail = '',
  autoFocus = false,
  className = '',
}: {
  defaultEmail?: string
  autoFocus?: boolean
  className?: string
}) {
  const [email, setEmail] = useState(defaultEmail)
  const [msg, setMsg] = useState('')

  // Sends an email: retried with ONE idempotency key, so never twice.
  const send = useAsyncAction((ctx, value: string) => requestGuestLink(value, ctx), {
    successMs: 3000,
    errorFallback: 'Could not send a new link. Try again.',
    onSuccess: (m) => setMsg(m ?? ''),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setMsg('')
    void send.run(value)
  }

  return (
    <form onSubmit={onSubmit} className={`mt-3 ${className}`}>
      <label className="block text-left text-xs font-semibold text-foreground/60" htmlFor="guest-link-email">
        Purchase email
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="guest-link-email"
          type="email"
          required
          autoFocus={autoFocus}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className="min-w-0 flex-1 rounded-xl border border-foreground/15 bg-transparent px-3 py-2 text-sm"
        />
        <ActionButton
          type="submit"
          action={send}
          loadingLabel="Sending…"
          successLabel="Sent"
          errorPlacement="none"
          retryPlacement="none"
          className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50 aria-busy:opacity-80"
        >
          Get a new access link
        </ActionButton>
      </div>
      <ActionStatus action={send} className="mt-2 text-sm text-foreground/60" />
      {send.errorText ? (
        <p className="mt-2 text-sm text-red-500" role="alert">
          {send.errorText}
        </p>
      ) : msg ? (
        <p className="mt-2 text-sm text-foreground/70" role="status">
          {msg}
        </p>
      ) : null}
    </form>
  )
}
