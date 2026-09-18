'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { register } from '@/lib/api'
import { GoogleLoginButton } from '@/components/google-login-button'
import { LegalAcceptTick } from '@/components/legal-accept'
import {
  captureReferralFromLocation,
  setReferralCode,
} from '@/lib/referral'

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

function generateSecurePassword(length = 16) {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const numbers = '0123456789'
  const symbols = '!@#$%^&*_-+=?'

  const all =
    lowercase +
    uppercase +
    numbers +
    symbols

  const randomValues = new Uint32Array(length)

  crypto.getRandomValues(randomValues)

  const password = Array.from(
    randomValues,
    (value) => all[value % all.length],
  )

  // Guarantee at least one character
  // from each important character group.
  password[0] =
    lowercase[randomValues[0] % lowercase.length]

  password[1] =
    uppercase[randomValues[1] % uppercase.length]

  password[2] =
    numbers[randomValues[2] % numbers.length]

  password[3] =
    symbols[randomValues[3] % symbols.length]

  return password.join('')
}

function SignupInner() {
  const router = useRouter()
  const sp = useSearchParams()

  const nextPath = sp.get('next') || '/'
  const prefillEmail = sp.get('email') || ''
  const prefillRef = (
    sp.get('ref') ||
    sp.get('referral') ||
    sp.get('referral_code') ||
    ''
  ).trim()

  const [name, setName] = useState('')
  const [email, setEmail] = useState(prefillEmail)
  const [referralCode, setReferralCodeField] = useState(prefillRef.toUpperCase())
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [showPassword, setShowPassword] = useState(false)

  const [accepted, setAccepted] = useState(false)
  const [legalRequired, setLegalRequired] = useState(false)

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (prefillEmail) {
      setEmail(prefillEmail)
    }
  }, [prefillEmail])

  useEffect(() => {
    const stored = captureReferralFromLocation()
    const next = (prefillRef || stored).toUpperCase()
    if (next) {
      setReferralCodeField(next)
      setReferralCode(next)
    }
  }, [prefillRef])

  function safeNext(path: string) {
    if (
      path.startsWith('/') &&
      !path.startsWith('//')
    ) {
      return path
    }

    return '/'
  }

  function handleGeneratePassword() {
    const generated = generateSecurePassword(16)

    setPassword(generated)
    setConfirm(generated)

    setShowPassword(true)
    setError('')
  }

  function handleLegalChange(next: boolean) {
    setAccepted(next)

    if (next) {
      setLegalRequired(false)
      setError('')
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()

    setError('')

    if (!accepted) {
      setLegalRequired(true)

      setError(
        'You cannot create an account until you accept the legal terms.',
      )

      return
    }

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setBusy(true)

    try {
      await register(
        email,
        password,
        name,
        confirm,
        true,
        referralCode,
      )

      router.push(
        `/verify-email?email=${encodeURIComponent(
          email,
        )}&next=${encodeURIComponent(nextPath)}`,
      )
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Sign up failed'

      if (isLegalError(message)) {
        setLegalRequired(true)
      }

      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-bold">
        Create your PlugYard account
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-foreground/65">
        A guest can read. An account is why the library can remember you:
        your page in a book, bookmarks, purchases, and invite rewards stay
        with you on the next phone. We also email you a personal note when
        a title matches how you read — or when someone joins with your code.
        Install the app after this if you want that same shelf one tap from
        the home screen.
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
          onChange={handleLegalChange}
        />

        {legalRequired && !accepted && (
          <p className="mt-2 text-sm text-red-500">
            You cannot continue until you accept
            the current legal terms.
          </p>
        )}
      </div>

      <div className="mt-6">
        <GoogleLoginButton
          accepted={accepted}
          referralCode={referralCode}
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
          onDone={() => {
            router.push(
              safeNext(nextPath),
            )

            router.refresh()
          }}
        />
      </div>

      <p className="mt-4 text-center text-xs text-foreground/40">
        or email
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-4 flex flex-col gap-3"
        autoComplete="on"
      >
        <input
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Name"
          value={name}
          onChange={(e) =>
            setName(e.target.value)
          }
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2"
        />

        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2"
        />

        <div>
          <input
            type="text"
            name="referral_code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Referral code (optional)"
            value={referralCode}
            onChange={(e) => {
              const next = e.target.value.toUpperCase()
              setReferralCodeField(next)
              setReferralCode(next)
            }}
            className="w-full rounded-lg border border-foreground/15 bg-transparent px-3 py-2 tracking-wide"
          />
          {referralCode ? (
            <p className="mt-1 text-xs text-foreground/55">
              You&apos;ll be linked to the person who shared this code.
            </p>
          ) : (
            <p className="mt-1 text-xs text-foreground/45">
              Have an invite? Paste the code here, or open their invite link.
            </p>
          )}
        </div>

        <div className="relative">
          <input
            type={
              showPassword
                ? 'text'
                : 'password'
            }
            name="new-password"
            autoComplete="new-password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
            className="w-full rounded-lg border border-foreground/15 bg-transparent px-3 py-2 pr-20"
          />

          <button
            type="button"
            onClick={() =>
              setShowPassword(
                (value) => !value,
              )
            }
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground/60 hover:text-foreground"
          >
            {showPassword
              ? 'Hide'
              : 'Show'}
          </button>
        </div>

        <button
          type="button"
          onClick={handleGeneratePassword}
          className="rounded-lg border border-foreground/15 px-3 py-2 text-sm transition hover:bg-foreground/5"
        >
          Generate strong password
        </button>

        <input
          type={
            showPassword
              ? 'text'
              : 'password'
          }
          name="confirm-password"
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setError('')
          }}
          className="rounded-lg border border-foreground/15 bg-transparent px-3 py-2"
        />

        {password &&
          confirm &&
          password !== confirm && (
            <p className="text-xs text-red-500">
              Passwords do not match.
            </p>
          )}

        {password &&
          confirm &&
          password === confirm && (
            <p className="text-xs text-green-600">
              Passwords match.
            </p>
          )}

        {error && (
          <p className="text-sm text-red-500">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {busy
            ? '…'
            : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-sm text-foreground/60">
        Have an account?{' '}
        <Link
          href={`/login?next=${encodeURIComponent(
            nextPath,
          )}`}
          className="underline"
        >
          Log in
        </Link>
      </p>

      <p className="mt-4 text-sm text-foreground/60">
        <Link
          href={`/forgot-password?email=${encodeURIComponent(
            email,
          )}&next=${encodeURIComponent(
            nextPath,
          )}`}
          className="underline"
        >
          Forgot password?
        </Link>
      </p>
    </main>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm">
          Loading…
        </div>
      }
    >
      <SignupInner />
    </Suspense>
  )
}