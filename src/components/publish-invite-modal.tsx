'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getToken } from '@/lib/api'
import { withReferralQuery } from '@/lib/referral'

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
          <h2 className="text-lg font-bold">Why create a PlugYard account</h2>
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
          Guests can browse. An account is how this library becomes yours —
          and how a Kenyan author gets a book on the shelf.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-foreground/70">
          <li>
            <strong className="text-foreground">Keep your place.</strong> Page
            47 of a statute, a bookmark, a paid file — they follow you to the
            next phone instead of dying with this browser.
          </li>
          <li>
            <strong className="text-foreground">Publish and earn.</strong>{' '}
            Upload a PDF, set a price or mark it free. When it sells, the
            publisher cut is yours. Boost and invite rewards only work on an
            account, because we have to know the book is yours.
          </li>
          <li>
            <strong className="text-foreground">Get notes meant for you.</strong>{' '}
            We email and tap you when a title matches how you read, when you
            leave a book unfinished, or when someone uses your invite — not a
            blast to everyone.
          </li>
        </ul>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href={withReferralQuery('/signup?next=/publish')}
            onClick={dismiss}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background"
          >
            Create a free account
          </Link>
          <Link
            href="/login?next=/publish"
            onClick={dismiss}
            className="inline-flex flex-1 items-center justify-center rounded-full border border-foreground/15 px-4 py-2.5 text-sm font-semibold"
          >
            I already have one
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
