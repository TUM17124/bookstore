'use client'

import { clearTokens, getToken } from '@/lib/api'

/**
 * The signed-in user's profile.
 *
 * The server (/api/me/) is the single source of truth. This module keeps ONE
 * in-browser copy that every part of the UI reads:
 *  - loaded from /api/me/ on page load (refreshMe), not only at login;
 *  - replaced from the server's answer after every profile change
 *    (setStoredUser(res.user)) — no logout/login needed to see it;
 *  - shared with other open tabs: a change in one tab is broadcast
 *    (BroadcastChannel, with the localStorage `storage` event as fallback)
 *    and every tab re-renders.
 *
 * Before Part A the copy was written only at login and never refreshed, so a
 * new name/username/email stayed invisible until the next login. The JWT
 * carries no profile fields (user id only), so nothing is read from it.
 */

const USER_KEY = 'bookstore_user'
const CHANNEL = 'plugyard-user'

export type AuthUser = {
  email: string
  name?: string
  id?: number
  username?: string
  first_name?: string
  last_name?: string
  password_auth?: boolean
  /** A requested new email waiting for its confirmation code. */
  pending_email?: string
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

let channel: BroadcastChannel | null = null
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL)
    // Another tab changed the user: re-render this one.
    channel.onmessage = () => window.dispatchEvent(new Event('auth-changed'))
  }
  return channel
}

/** Replace the user copy (from the server's answer) and update every
 * component in this tab and in other open tabs. */
export function setStoredUser(user: AuthUser | null) {
  if (typeof window === 'undefined') return
  try {
    if (!user) localStorage.removeItem(USER_KEY)
    else localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // private mode: this tab still updates through the event below
  }
  window.dispatchEvent(new Event('auth-changed'))
  getChannel()?.postMessage({ type: 'user-changed' })
}

/** Something account-level other than the profile changed (notification
 * preferences, payout account, subscription): tell this tab and other open
 * tabs to re-read it from the server. */
export function broadcastAccountChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('auth-changed'))
  getChannel()?.postMessage({ type: 'account-changed' })
}

/** Load the profile from the server (the source of truth) and publish it.
 * Returns the fresh user, or null when signed out / unreachable (the cached
 * copy is kept then, so a brief outage doesn't blank the navbar). */
export async function refreshMe(): Promise<AuthUser | null> {
  if (!getToken()) return null
  const { api } = await import('@/lib/api')
  try {
    const me = await api<AuthUser>('/me/')
    if (!me?.email) return null
    const before = JSON.stringify(getStoredUser())
    if (before !== JSON.stringify(me)) setStoredUser(me)
    return me
  } catch {
    return null
  }
}

/** Start listening for user changes broadcast by other tabs. */
export function listenForUserChanges() {
  getChannel()
}

export function isLoggedIn() {
  return !!getToken()
}

export function clientLogout() {
  clearTokens()
  setStoredUser(null)
}
