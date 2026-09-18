'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { login } from '@/lib/api'
import { setStoredUser } from '@/lib/auth-client'
import { GoogleLoginButton } from '@/components/google-login-button'
import { LegalAcceptTick } from '@/components/legal-accept'
import { bindPushToAccount } from '@/lib/push'
import { captureReferralFromLocation, getReferralCode } from '@/lib/referral'

function isLegalError(message: string) {
  const text = message.toLowerCase()
  return (
    text.includes('legal') ||
    text.includes('terms') ||
    text.includes('accept') ||
    text.includes('privacy policy') ||
    text.includes('terms of use') ||
    text.includes('refund policy')
  )
}

function LoginInner() {
  const router = useRouter()
  const sp = useSearchParams()

  const nextPath = sp.get('next') || '/'
  const prefillEmail = sp.get('email') || ''

  const [email, setEmail] = useState(prefillEmail)
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [legalRequired, setLegalRequired] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [referralCode, setReferralCodeState] = useState('')

  useEffect(() => {
    if (prefillEmail) setEmail(prefillEmail)
  }, [prefillEmail])

  useEffect(() => {
    setReferralCodeState(captureReferralFromLocation() || getReferralCode())
  }, [])

  function safeNext(path: string) {
    if (path.startsWith('/') && !path.startsWith('//')) return path
    return '/'
  }

  function finishLogin(userEmail: string, name?: string) {
    setStoredUser({
      email: userEmail,
      name: name || userEmail.split('@')[0],
    })
    window.dispatchEvent(new Event('auth-changed'))
    void bindPushToAccount()
    router.push(safeNext(nextPath))
    router.refresh()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)

    try {
      const data = await login(email, password, accepted)
      if (!data.access) throw new Error('Login failed.')

      setLegalRequired(false)
      finishLogin(
        data.user?.email || email,
        data.user?.name || data.user?.email,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      if (isLegalError(message)) {
        setLegalRequired(true)
        setError(
          accepted
            ? message
            : 'You cannot continue until you accept the current legal terms.',
        )
      } else {
        setError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-bold">Log in</h1>
      <p className="mt-2 text-sm leading-relaxed text-foreground/65">
        Signing in puts your place, bookmarks, purchases, and invite
        wallet on this phone. After that, install PlugYard so the library
        opens like an app instead of a tab you have to search for.
      </p>

      <div
        className={`mt-6 rounded-lg ${
          legalRequired && !accepted
            ? 'border border-red-500/60 bg-red-500/5 p-3'
            : ''
        }`}
      >
        <LegalAcceptTick
          checked={accepted}
          onChange={(next) => {
            setAccepted(next)
            if (next) {
              setLegalRequired(false)
              setError('')
            }
          }}
        />
        {legalRequired && !accepted && (
          <p className="mt-2 text-sm text-red-500">
            You cannot continue until you accept the current legal terms.
          </p>
        )}
      </div>

      <div className="mt-6">
        <GoogleLoginButton
          accepted={accepted}
          referralCode={referralCode}
          onDone={() => {
            window.dispatchEvent(new Event('auth-changed'))
            void bindPushToAccount()
            router.push(safeNext(nextPath))
            router.refresh()
          }}
          onError={(message) => {
            if (isLegalError(message)) {
              setLegalRequired(true)
              setError(
                accepted
                  ? message
                  : 'You cannot continue with Google until you accept the legal terms.',
              )
              return
            }
            setError(message)
          }}
        />
      </div>

      <p className="mt-4 text-center text-xs text-foreground/40">or email</p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
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
          {busy ? '…' : 'Log in'}
        </button>
      </form>

      <p className="mt-4 text-sm text-foreground/60">
        <Link
          href={`/forgot-password?email=${encodeURIComponent(
            email,
          )}&next=${encodeURIComponent(nextPath)}`}
          className="underline"
        >
          Forgot password?
        </Link>
      </p>

      <p className="mt-2 text-sm text-foreground/60">
        No account?{' '}
        <Link
          href={`/signup?email=${encodeURIComponent(
            email,
          )}&next=${encodeURIComponent(nextPath)}${
            referralCode ? `&ref=${encodeURIComponent(referralCode)}` : ''
          }`}
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