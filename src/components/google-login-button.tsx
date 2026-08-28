'use client'

import { useEffect } from 'react'
import { googleLogin, setTokens } from '@/lib/api'
import { setStoredUser } from '@/lib/auth-client'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: Record<string, unknown>) => void
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
        }
      }
    }
  }
}

export function GoogleLoginButton({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) return

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp: { credential: string }) => {
          const data = await googleLogin(resp.credential)
          if (data.access) setTokens(data.access, data.refresh)
          setStoredUser({
            email: data.user?.email || '',
            name: data.user?.name || data.user?.email || 'Account',
          })
          window.dispatchEvent(new Event('auth-changed'))
          onDone()
        },
      })
      const el = document.getElementById('google-btn')
      if (el) {
        window.google?.accounts.id.renderButton(el, {
          theme: 'outline',
          size: 'large',
          width: 320,
        })
      }
    }
    document.body.appendChild(script)
  }, [onDone])

  return <div id="google-btn" className="flex justify-center" />
}