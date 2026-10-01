'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { verifyEmail, resendCode, setToken } from '@/lib/api'
import { setStoredUser } from '@/lib/auth-client'
import { bindPushToAccount } from '@/lib/push'
import { clearReferralCode } from '@/lib/referral'
import { useAsyncAction } from '@/hooks/use-async-action'
import { ActionButton } from '@/components/ui/action-button'

function Inner() {
  const router = useRouter()
  const sp = useSearchParams()
  function safeNext(path: string) {
  if (path.startsWith('/') && !path.startsWith('//')) return path
  return '/'
}
  const email = (sp.get('email') || '').toLowerCase()
  const nextPath = sp.get('next') || '/'
  const [code, setCode] = useState('')
  // Verify returns login tokens, so it is never auto-retried (the server
  // must not store that response for replay); a failure offers "Try again".
  const activate = useAsyncAction((ctx, value: string) => verifyEmail(email, value, ctx), {
    successMs: 60_000,
    errorFallback: "Couldn't verify the code. Please try again.",
    onSuccess: (data) => {
      if (data.access) setToken(data.access)
      setStoredUser({ email: data.user?.email || email, name: data.user?.name })
      window.dispatchEvent(new Event('auth-changed'))
      clearReferralCode()
      void bindPushToAccount()
      router.push(safeNext(sp.get('next') || '/'))
    },
  })
  // Sends an email: retried with one idempotency key, so never twice.
  const resend = useAsyncAction((ctx) => resendCode(email, 'verify', ctx), {
    successMs: 4000,
    errorFallback: "Couldn't send a new code. Please try again.",
  })

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    void activate.run(code)
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
        <ActionButton
          type="submit"
          action={activate}
          loadingLabel="Activating…"
          successLabel="Activated"
          errorClassName="text-sm text-red-500"
          className="rounded-full bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50 aria-busy:opacity-80"
        >
          Activate account
        </ActionButton>
      </form>
      <ActionButton
        action={resend}
        onClick={() => resend.run()}
        loadingLabel="Sending…"
        successLabel="Code sent again"
        errorClassName="mt-2 text-sm text-red-500"
        className="mt-4 self-start text-sm underline"
      >
        Resend code
      </ActionButton>
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