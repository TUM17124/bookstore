'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { resetPassword, setToken } from '@/lib/api'
import { useAsyncAction } from '@/hooks/use-async-action'
import { ActionButton } from '@/components/ui/action-button'
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

  // Returns login tokens: never auto-retried; a failure offers "Try again".
  const save = useAsyncAction(
    (ctx, c: string, pw: string, cf: string) => resetPassword(email, c, pw, cf, ctx),
    {
      successMs: 60_000,
      errorFallback: "Couldn't save the new password. Please try again.",
      onSuccess: (data) => {
        if (data.access) setToken(data.access)
        setStoredUser({
          email: data.user?.email || email,
          name: data.user?.name,
        })
        window.dispatchEvent(new Event('auth-changed'))
        router.push(nextPath)
        router.refresh()
      },
    },
  )

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setError('')
    void save.run(code, password, confirm)
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
        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
        <ActionButton
          type="submit"
          action={save}
          loadingLabel="Saving…"
          successLabel="Password saved"
          errorClassName="text-sm text-red-500"
          className="rounded-full bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50 aria-busy:opacity-80"
        >
          Save password
        </ActionButton>
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