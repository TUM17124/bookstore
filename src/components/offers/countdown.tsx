"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"

/**
 * Part C: honest countdowns. The target is the campaign's real end (or
 * start) time from the server, never a timer that restarts on reload. The
 * phone's clock may be wrong, so every API answer that carries `server_now`
 * corrects it (noteServerTime). One shared 1-second ticker drives every
 * countdown on the page.
 */

let offsetMs = 0
let ticker: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()
let nowSnapshot = Date.now()

/** Call with a response's `server_now` to correct for a wrong device clock. */
export function noteServerTime(serverNow?: string | null) {
  if (!serverNow) return
  const t = Date.parse(serverNow)
  if (!Number.isNaN(t)) offsetMs = t - Date.now()
}

export function serverNow(): number {
  return Date.now() + offsetMs
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  if (!ticker) {
    ticker = setInterval(() => {
      nowSnapshot = serverNow()
      listeners.forEach((l) => l())
    }, 1000)
  }
  return () => {
    listeners.delete(cb)
    if (!listeners.size && ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }
}

function useServerNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => nowSnapshot,
    () => 0,
  )
}

/** "2d 04:12:09" / "04:12:09". */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const hms = [h, m, s].map((n) => String(n).padStart(2, "0")).join(":")
  return d > 0 ? `${d}d ${hms}` : hms
}

/** The exact end, in the reader's own time zone. */
export function formatLocalTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function Countdown({
  target,
  label = "Ends in",
  onExpire,
  className = "",
}: {
  /** ISO time from the server (campaign end, or start for "Starts in"). */
  target: string
  label?: string
  /** Called once when it reaches zero - refetch the price then. */
  onExpire?: () => void
  className?: string
}) {
  const now = useServerNow()
  const end = Date.parse(target)
  const left = now ? end - now : end - serverNow()
  const fired = useRef(false)

  useEffect(() => {
    fired.current = false
  }, [target])

  useEffect(() => {
    if (now && left <= 0 && !fired.current) {
      fired.current = true
      onExpire?.()
    }
  }, [now, left, onExpire])

  if (Number.isNaN(end)) return null
  const done = left <= 0
  return (
    <span
      role="timer"
      aria-label={done ? `${label.replace(/ in$/, "")} ended` : `${label} ${formatRemaining(left)}, at ${formatLocalTime(target)}`}
      title={formatLocalTime(target)}
      className={`tabular-nums ${className}`}
      suppressHydrationWarning
    >
      {done ? (label === "Starts in" ? "Starting now" : "Offer ended") : `${label} ${formatRemaining(left)}`}
    </span>
  )
}
