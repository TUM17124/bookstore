'use client'

import { useState, type FormEvent } from 'react'
import { requestGuestLink } from '@/lib/api'

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
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value || busy) return
    setBusy(true)
    setMsg('')
    setIsError(false)
    try {
      setMsg(await requestGuestLink(value))
    } catch (err) {
      setIsError(true)
      setMsg(err instanceof Error ? err.message : 'Could not send a new link. Try again.')
    } finally {
      setBusy(false)
    }
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
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Get a new access link'}
        </button>
      </div>
      {msg ? (
        <p className={`mt-2 text-sm ${isError ? 'text-red-500' : 'text-foreground/70'}`} role="status">
          {msg}
        </p>
      ) : null}
    </form>
  )
}
