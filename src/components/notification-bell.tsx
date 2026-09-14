"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import {
  Bell,
  BookOpen,
  CheckCheck,
  Gift,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react"
import { getToken } from "@/lib/api"

const API = process.env.NEXT_PUBLIC_API_URL!

type Notice = {
  id: number
  kind?: string
  title: string
  body: string
  url: string
  created_at: string
  read: boolean
}

function kindIcon(kind?: string) {
  switch (kind) {
    case "referral_joined":
    case "referred_welcome":
      return UserPlus
    case "reward_book":
    case "reward_referral":
      return Gift
    case "welcome":
    case "recommended":
    case "comeback":
      return Sparkles
    default:
      return BookOpen
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notice[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadNotifications = async () => {
    const token = getToken()
    if (!token) {
      setSignedIn(false)
      setItems([])
      setUnread(0)
      return
    }
    setSignedIn(true)

    try {
      setLoading(true)
      const response = await fetch(`${API}/notifications/`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (!response.ok) return
      const data = await response.json()
      setItems(data.results || [])
      setUnread(data.unread || 0)
    } catch {
      // Ignore notification loading errors.
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
    const handleFocus = () => loadNotifications()
    window.addEventListener("focus", handleFocus)
    window.addEventListener("auth-changed", handleFocus)
    const timer = window.setInterval(loadNotifications, 45000)
    return () => {
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("auth-changed", handleFocus)
      window.clearInterval(timer)
    }
  }, [])

  const markAsRead = async (noticeId: number) => {
    const token = getToken()
    if (!token) return
    try {
      const response = await fetch(`${API}/notifications/${noticeId}/read/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return
      setItems((current) =>
        current.map((item) =>
          item.id === noticeId ? { ...item, read: true } : item,
        ),
      )
      setUnread((current) => Math.max(0, current - 1))
    } catch {
      // Ignore read errors.
    }
  }

  const markAllAsRead = async () => {
    const token = getToken()
    if (!token || unread === 0) return
    try {
      const response = await fetch(`${API}/notifications/read-all/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return
      setItems((current) => current.map((item) => ({ ...item, read: true })))
      setUnread(0)
    } catch {
      // Ignore read errors.
    }
  }

  const handleNotificationClick = async (item: Notice) => {
    if (!item.read) await markAsRead(item.id)
    setOpen(false)
  }

  if (!signedIn) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value)
          if (!open) loadNotifications()
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10"
        aria-label={
          unread > 0 ? `${unread} unread notifications` : "Notifications"
        }
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && mounted && createPortal(
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-[70] cursor-default"
            onClick={() => setOpen(false)}
          />

          <div className="fixed left-3 right-3 top-[4.75rem] z-[80] flex max-h-[min(72dvh,calc(100dvh-5.75rem))] w-auto flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-950 sm:left-auto sm:right-4 sm:w-[min(360px,calc(100vw-2rem))]">
            <div className="flex shrink-0 items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
              <div>
                <h3 className="text-sm font-semibold">Your notes</h3>
                {unread > 0 ? (
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {unread} waiting for you
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Written for your shelf
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="rounded-lg p-2 text-neutral-500 transition hover:bg-black/5 hover:text-black dark:hover:bg-white/10 dark:hover:text-white"
                    aria-label="Mark all notifications as read"
                    title="Mark all as read"
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-2 text-neutral-500 transition hover:bg-black/5 hover:text-black dark:hover:bg-white/10 dark:hover:text-white"
                  aria-label="Close notifications"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              {loading && items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-neutral-500">
                  Loading your notes…
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell className="mx-auto mb-3 h-8 w-8 text-neutral-400" />
                  <p className="text-sm font-medium">Your inbox is quiet</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    When a book, invite, or unfinished page is meant for you,
                    it will land here and in your email.
                  </p>
                </div>
              ) : (
                <div>
                  {items.map((item) => {
                    const Icon = kindIcon(item.kind)
                    return (
                      <Link
                        key={item.id}
                        href={item.url || "/"}
                        onClick={() => handleNotificationClick(item)}
                        className={`block border-b border-black/5 px-4 py-3 transition last:border-b-0 dark:border-white/5 ${
                          item.read
                            ? "bg-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                            : "bg-black/[0.03] hover:bg-black/[0.06] dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                        }`}
                      >
                        <div className="flex gap-3">
                          <div
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                              item.read
                                ? "bg-neutral-100 text-neutral-400 dark:bg-white/5"
                                : "bg-black text-white dark:bg-white dark:text-black"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="break-words text-sm font-semibold leading-5">
                                {item.title}
                              </h4>
                              {!item.read && (
                                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                              )}
                            </div>
                            <p className="mt-1 break-words text-sm leading-5 text-neutral-600 dark:text-neutral-400">
                              {item.body}
                            </p>
                            <p className="mt-2 text-[11px] text-neutral-400">
                              {formatNotificationDate(item.created_at)}
                            </p>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

function formatNotificationDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const now = Date.now()
  const diff = now - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return "Just now"
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`
  return date.toLocaleDateString()
}
