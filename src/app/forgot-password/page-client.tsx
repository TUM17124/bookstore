'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { forgotPassword } from '@/lib/api'

function safeNext(path: string) {
  if (path.startsWith('/') && !path.startsWith('//')) return path
  return '/'
}

function Inner() {
  const router = useRouter()
  const sp = useSearchParams()
  const nextPath = safeNext(sp.get('next') || '/')
  const [email, setEmail] = useState(sp.get('email') || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await forgotPassword(email)
      const q = new URLSearchParams({
        email,
        next: nextPath,
      })
      router.push(`/reset-password?${q.toString()}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-bold">Forgot password</h1>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {busy ? '…' : 'Send reset code'}
        </button>
      </form>
      <p className="mt-4 text-sm text-foreground/60">
        Remembered it?{' '}
        <Link
          href={`/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}`}
          className="underline"
        >
          Log in
        </Link>
      </p>
      <p className="mt-2 text-sm text-foreground/60">
        No account?{' '}
        <Link
          href={`/signup?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}`}
          className="underline"
        >
          Sign up
        </Link>
      </p>
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