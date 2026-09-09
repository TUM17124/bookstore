'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getToken } from '@/lib/api'

const KEY = 'plugyard-publish-invite'
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

function shouldShow(): boolean {
  if (typeof window === 'undefined') return false
  if (getToken()) return false

  const path = window.location.pathname
  if (
    path.startsWith('/login') ||
    path.startsWith('/signup') ||
    path.startsWith('/publish') ||
    path.startsWith('/checkout') ||
    path.startsWith('/verify')
  ) {
    return false
  }

  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { dismissedAt?: number; seen?: number }
      if (saved.dismissedAt && Date.now() - saved.dismissedAt < COOLDOWN_MS) {
        return false
      }
    }
  } catch {
    /* ignore */
  }

  const visits = Number(sessionStorage.getItem(`${KEY}:visits`) || 0) + 1
  sessionStorage.setItem(`${KEY}:visits`, String(visits))

  const seconds = Number(sessionStorage.getItem(`${KEY}:sec`) || 0)
  const scrolled = Number(sessionStorage.getItem(`${KEY}:scroll`) || 0)

  // Show after a real visit: 25s on site OR 45% scroll OR 2nd page this session
  return seconds >= 25 || scrolled >= 45 || visits >= 2
}

export function PublishInviteModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let shown = false
    let tick: ReturnType<typeof setInterval> | null = null

    const markScroll = () => {
      const el = document.documentElement
      const max = el.scrollHeight - el.clientHeight
      if (max <= 0) return
      const pct = Math.round((el.scrollTop / max) * 100)
      const prev = Number(sessionStorage.getItem(`${KEY}:scroll`) || 0)
      if (pct > prev) sessionStorage.setItem(`${KEY}:scroll`, String(pct))
    }

    const maybeOpen = () => {
      if (shown || !shouldShow()) return
      shown = true
      setOpen(true)
    }

    const start = Date.now()
    tick = setInterval(() => {
      const sec = Math.floor((Date.now() - start) / 1000)
      sessionStorage.setItem(`${KEY}:sec`, String(sec))
      maybeOpen()
    }, 1000)

    window.addEventListener('scroll', markScroll, { passive: true })
    const t = window.setTimeout(maybeOpen, 8000)

    return () => {
      if (tick) clearInterval(tick)
      window.clearTimeout(t)
      window.removeEventListener('scroll', markScroll)
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ dismissedAt: Date.now() }))
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">Publish on PlugYard</h2>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-foreground/10"
          >
            ×
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/70">
          Create a free account, upload your PDF, and set a price — or mark it free
          for other readers. When it sells, you earn the publisher cut. Boost a
          published title to feature it on the shelf.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/signup?next=/publish"
            onClick={dismiss}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background"
          >
            Sign up and publish
          </Link>
          <Link
            href="/login?next=/publish"
            onClick={dismiss}
            className="inline-flex flex-1 items-center justify-center rounded-full border border-foreground/15 px-4 py-2.5 text-sm font-semibold"
          >
            Log in
          </Link>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 w-full text-center text-xs text-foreground/45"
        >
          Not now
        </button>
      </div>
    </div>
  )
}