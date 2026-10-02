"use client"

import { useEffect, useRef, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "@teispace/next-themes"
import { retryLabel } from "@/components/ui/action-button"
import { useAsyncAction } from "@/hooks/use-async-action"
import { getToken, saveTheme } from "@/lib/api"
import { setStoredUser } from "@/lib/auth-client"
import { clearPending, readPending, setPending, tokenUserId, type ThemeChoice } from "@/lib/theme"

/**
 * The light/dark toggle (navbar, desktop and phone). The new theme applies at
 * once and is kept in this browser (also for guests); when logged in it is
 * also saved to the account, with the shared button states: busy while
 * saving, a retry countdown on connection problems, and a clear note if it
 * could not be saved (it is then sent next time - see lib/theme.ts).
 */
export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the theme is only known in the browser
  useEffect(() => setMounted(true), [])

  const again = useRef<(t: ThemeChoice) => void>(() => {})
  const save = useAsyncAction(
    async (ctx, theme: ThemeChoice) => {
      const res = await saveTheme(theme, ctx)
      clearPending(theme)
      setStoredUser(res.user)
      return res
    },
    {
      successMs: 0,
      errorFallback: "Couldn't save your theme to your account.",
      onSuccess: (res) => {
        // Toggled again while this was saving: send the latest choice too.
        const p = readPending()
        if (p && p.theme !== res.theme) setTimeout(() => again.current(p.theme), 0)
      },
    },
  )
  useEffect(() => {
    again.current = (t) => void save.run(t)
  })

  if (!mounted) return <div className="w-9 h-9" />

  const isDark = resolvedTheme === "dark"

  const toggle = () => {
    const next: ThemeChoice = isDark ? "light" : "dark"
    setTheme(next)
    const token = getToken()
    const uid = tokenUserId(token)
    if (token && uid != null) {
      setPending(next, uid)
      void save.run(next)
    }
  }

  const note =
    save.state === "retrying"
      ? retryLabel(save.retry)
      : save.state === "error"
        ? "Theme changed on this device. It couldn't be saved to your account yet and will be saved next time."
        : ""

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        aria-busy={save.busy || undefined}
        data-state={save.state}
        title={note || (isDark ? "Switch to light mode" : "Switch to dark mode")}
        className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-foreground/5 transition-colors text-foreground/70 hover:text-foreground aria-busy:animate-pulse"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
      {save.state === "error" || save.state === "retrying" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--brand-pink)] ring-2 ring-background"
        />
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {note}
      </span>
    </span>
  )
}
