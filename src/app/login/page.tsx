'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { login } from '@/lib/api'
import { setStoredUser } from '@/lib/auth-client'

function LoginInner() {
  const router = useRouter()
  const sp = useSearchParams()

  const nextPath = sp.get('next') || '/'
  const prefillEmail = sp.get('email') || ''

  const [email, setEmail] = useState(prefillEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (prefillEmail) setEmail(prefillEmail)
  }, [prefillEmail])

  function safeNext(path: string) {
    // only allow relative paths on this site
    if (path.startsWith('/') && !path.startsWith('//')) return path
    return '/'
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email, password)
      setStoredUser({
        email,
        name: email.split('@')[0],
      })
      window.dispatchEvent(new Event('auth-changed'))
      router.push(safeNext(nextPath))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-bold">Log in</h1>
      {nextPath.startsWith('/checkout') && (
        <p className="mt-2 text-sm text-foreground/55">
          After you log in, you will return to checkout to finish your purchase.
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {busy ? '…' : nextPath.startsWith('/checkout') ? 'Log in & continue' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-sm text-foreground/60">
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm">Loading…</div>}>
      <LoginInner />
    </Suspense>
  )
}