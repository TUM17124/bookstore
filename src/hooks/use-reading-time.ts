"use client"

import { useEffect } from "react"
import { queueSignal } from "@/lib/api"

const TICK_MS = 5_000
const FLUSH_MS = 60_000
const MAX_GAP_MS = 15_000 // a sleeping laptop never counts as reading
const IDLE_MS = 120_000 // reader: no scroll/tap/key for 2 minutes = not reading

/**
 * Part E (PR 3): reading/listening time for the interaction signals.
 * - "reader": counts while the page is visible and the reader was used in
 *   the last two minutes (an open, forgotten tab doesn't count).
 * - "audio": counts while `active` (playing), visible or not.
 * Sent as read_time signals about once a minute and when the page is hidden
 * or the reader closes.
 */
export function useReadingTime(bookId: string | undefined, active: boolean, mode: "reader" | "audio") {
  useEffect(() => {
    if (!bookId || !active || typeof window === "undefined") return
    let secs = 0
    let last = Date.now()
    let lastInput = Date.now()
    const counting = () =>
      mode === "audio" || (document.visibilityState === "visible" && Date.now() - lastInput < IDLE_MS)
    const tick = () => {
      const now = Date.now()
      if (counting()) secs += Math.min(now - last, MAX_GAP_MS) / 1000
      last = now
    }
    const flush = () => {
      tick()
      if (secs >= 1) {
        queueSignal({ kind: "read_time", book_id: bookId, placement: mode, value: Math.round(secs) })
        secs = 0
      }
    }
    const onInput = () => {
      lastInput = Date.now()
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush()
      else last = Date.now() // time away doesn't count
    }
    const inputs = ["scroll", "wheel", "pointerdown", "keydown", "touchstart"] as const
    inputs.forEach((e) => window.addEventListener(e, onInput, { passive: true, capture: true }))
    document.addEventListener("visibilitychange", onVisibility)
    const t = window.setInterval(tick, TICK_MS)
    const f = window.setInterval(flush, FLUSH_MS)
    return () => {
      window.clearInterval(t)
      window.clearInterval(f)
      inputs.forEach((e) => window.removeEventListener(e, onInput, { capture: true }))
      document.removeEventListener("visibilitychange", onVisibility)
      flush()
    }
  }, [bookId, active, mode])
}
