'use client'

import { clearTokens, getToken } from '@/lib/api'

const USER_KEY = 'bookstore_user'

export type AuthUser = {
  email: string
  name?: string
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function setStoredUser(user: AuthUser | null) {
  if (typeof window === 'undefined') return
  if (!user) localStorage.removeItem(USER_KEY)
  else localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function isLoggedIn() {
  return !!getToken()
}

export function clientLogout() {
  clearTokens()
  setStoredUser(null)
  window.dispatchEvent(new Event('auth-changed'))
}