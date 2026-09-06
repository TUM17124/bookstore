'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { resetPassword, setToken } from '@/lib/api'
import { setStoredUser } from '@/lib/auth-client'

function safeNext(path: string) {
  if (path.startsWith('/') && !path.startsWith('//')) return path
  return '/'
}

function Inner() {
  const router = useRouter()
  const sp = useSearchParams()
  const email = (sp.get('email') || '').toLowerCase()
  const nextPath = safeNext(sp.get('next') || '/')

  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await resetPassword(email, code, password, confirm)
      if (data.access) setToken(data.access)
      setStoredUser({
        email: data.user?.email || email,
        name: data.user?.name,
      })
      window.dispatchEvent(new Event('auth-changed'))
      router.push(nextPath)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-bold">Reset password</h1>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <input
          required
          inputMode="numeric"
          maxLength={6}
          placeholder="Code from email"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {busy ? '…' : 'Save password'}
        </button>
      </form>
      <p className="mt-4 text-sm text-foreground/60">
        Back to{' '}
        <Link
          href={`/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}`}
          className="underline"
        >
          Log in
        </Link>
        {' · '}
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