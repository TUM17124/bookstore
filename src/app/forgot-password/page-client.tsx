'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { forgotPassword } from '@/lib/api'
import { useAsyncAction } from '@/hooks/use-async-action'
import { ActionButton } from '@/components/ui/action-button'

function safeNext(path: string) {
  if (path.startsWith('/') && !path.startsWith('//')) return path
  return '/'
}

function Inner() {
  const router = useRouter()
  const sp = useSearchParams()
  const nextPath = safeNext(sp.get('next') || '/')
  const [email, setEmail] = useState(sp.get('email') || '')
  // Sends an email: retried with one idempotency key, so never twice.
  const send = useAsyncAction((ctx, value: string) => forgotPassword(value, ctx), {
    successMs: 60_000,
    errorFallback: "Couldn't send the reset code. Please try again.",
    onSuccess: () => {
      const q = new URLSearchParams({
        email,
        next: nextPath,
      })
      router.push(`/reset-password?${q.toString()}`)
    },
  })

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    void send.run(email)
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
        <ActionButton
          type="submit"
          action={send}
          loadingLabel="Sending…"
          successLabel="Code sent"
          errorClassName="text-sm text-red-500"
          className="rounded-full bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50 aria-busy:opacity-80"
        >
          Send reset code
        </ActionButton>
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