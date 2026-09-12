'use client'

import { useEffect, useRef } from 'react'
import { googleLogin, setTokens, clearTokens } from '@/lib/api'
import { setStoredUser } from '@/lib/auth-client'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: Record<string, unknown>) => void
          renderButton: (
            el: HTMLElement,
            opts: Record<string, unknown>,
          ) => void
        }
      }
    }
  }
}

function isLegalError(message: string) {
  const text = message.toLowerCase()

  return (
    text.includes('legal') ||
    text.includes('terms') ||
    text.includes('accept') ||
    text.includes('privacy policy') ||
    text.includes('terms of use')
  )
}

export function GoogleLoginButton({
  accepted,
  onDone,
  onError,
}: {
  accepted: boolean
  onDone: () => void
  onError?: (message: string) => void
}) {
  const acceptedRef = useRef(accepted)
  const onDoneRef = useRef(onDone)
  const onErrorRef = useRef(onError)

  acceptedRef.current = accepted
  onDoneRef.current = onDone
  onErrorRef.current = onError

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

    if (!clientId) {
      onErrorRef.current?.(
        'Google login is not configured. Please use email login.',
      )
      return
    }

    const script = document.createElement('script')

    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true

    script.onload = () => {
      if (!window.google) return

      window.google.accounts.id.initialize({
        client_id: clientId,

        callback: async (resp: { credential: string }) => {
          try {
            /*
             * First try WITHOUT sending legal acceptance.
             *
             * If this is an existing account that already accepted
             * the current legal version, the backend allows login.
             *
             * If acceptance is required, the backend rejects it and
             * we show the legal warning.
             */
            const data = await googleLogin(
              resp.credential,
              acceptedRef.current,
            )

            if (data.access) {
              setTokens(data.access, data.refresh)
            }

            /*
             * If the backend returned a successful login, the account
             * has either already accepted the current legal version
             * or the user explicitly accepted it.
             */
            setStoredUser({
              email: data.user?.email || '',
              name:
                data.user?.name ||
                data.user?.email ||
                'Account',
            })

            window.dispatchEvent(new Event('auth-changed'))

            onDoneRef.current()
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : 'Google login failed.'

            /*
             * Do not leave a partially authenticated session behind
             * when legal acceptance is required.
             */
            if (isLegalError(message)) {
              clearTokens()

              onErrorRef.current?.(
                'You cannot continue with Google until you accept the legal terms. Tick the box above and try again.',
              )

              return
            }

            onErrorRef.current?.(message)
          }
        },
      })

      const el = document.getElementById('google-btn')

      if (!el) return

      el.innerHTML = ''

      window.google.accounts.id.renderButton(el, {
        theme: 'outline',
        size: 'large',
        width: 320,
      })
    }

    script.onerror = () => {
      onErrorRef.current?.(
        'Could not load Google login. Please try again.',
      )
    }

    document.body.appendChild(script)

    return () => {
      script.remove()
    }
  }, [])

  return (
    <div className="flex w-full justify-center overflow-hidden bg-transparent">
      <div
        id="google-btn"
        className="flex min-h-[44px] w-full justify-center bg-transparent"
      />
    </div>
  )
}