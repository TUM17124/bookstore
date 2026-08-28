'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { verifyEmail, resendCode, setToken } from '@/lib/api'
import { setStoredUser } from '@/lib/auth-client'

function Inner() {
  const router = useRouter()
  const sp = useSearchParams()
  const email = (sp.get('email') || '').toLowerCase()
  const nextPath = sp.get('next') || '/'
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await verifyEmail(email, code)
      if (data.access) setToken(data.access)
      setStoredUser({ email: data.user?.email || email, name: data.user?.name })
      window.dispatchEvent(new Event('auth-changed'))
      router.push(nextPath.startsWith('/') ? nextPath : '/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-bold">Verify email</h1>
      <p className="mt-2 text-sm text-foreground/60">
        We sent a 6-digit code to <span className="font-medium">{email}</span>
      </p>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <input
          required
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2 tracking-[0.4em]"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {busy ? '…' : 'Activate account'}
        </button>
      </form>
      <button
        type="button"
        className="mt-4 text-sm underline"
        onClick={async () => {
          try {
            await resendCode(email, 'verify')
            setSent(true)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed')
          }
        }}
      >
        {sent ? 'Code sent again' : 'Resend code'}
      </button>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm">Loading…</div>}>
      <Inner />
    </Suspense>
  )
}