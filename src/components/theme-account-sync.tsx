"use client"

import { useEffect } from "react"
import { useTheme } from "@teispace/next-themes"
import { getToken, saveTheme } from "@/lib/api"
import { getStoredUser, setStoredUser } from "@/lib/auth-client"
import { clearPending, isThemeChoice, localTheme, readPending, tokenUserId, type ThemeChoice } from "@/lib/theme"

let inFlight = false

function push(theme: ThemeChoice) {
  if (inFlight) return
  inFlight = true
  saveTheme(theme)
    .then((res) => {
      clearPending(theme)
      setStoredUser(res.user)
    })
    .catch(() => {
      // stays pending; sent again on the next page load or login
    })
    .finally(() => {
      inFlight = false
    })
}

/**
 * Keeps the theme in step with the account (lib/theme.ts). Runs on page load
 * and on every "auth-changed" (login, logout, profile refreshed from
 * /api/me/, another tab):
 * - a change this device couldn't save yet is sent first;
 * - otherwise the account's choice wins (login, other devices);
 * - an account with no choice yet takes this device's choice.
 * Other open tabs follow through next-themes' storage sync.
 */
export function ThemeAccountSync() {
  const { setTheme } = useTheme()

  useEffect(() => {
    const apply = () => {
      const token = getToken()
      const uid = tokenUserId(token)
      if (!token || uid == null) return
      const pending = readPending()
      if (pending && pending.uid === uid) {
        push(pending.theme)
        return
      }
      const me = getStoredUser()
      // Only the full copy from /api/me/ (the partial one written at login
      // has no id and no theme yet).
      if (!me || me.id == null || me.id !== uid) return
      if (isThemeChoice(me.theme)) {
        if (localTheme() !== me.theme) setTheme(me.theme)
        return
      }
      const local = localTheme()
      if (local) push(local)
    }
    apply()
    window.addEventListener("auth-changed", apply)
    return () => window.removeEventListener("auth-changed", apply)
  }, [setTheme])

  return null
}
