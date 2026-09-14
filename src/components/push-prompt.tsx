"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getToken } from "@/lib/api"
import {
  bindPushToAccount,
  enablePushNotifications,
  getPushSubscription,
  savePushSubscription,
} from "@/lib/push"
import { getStoredUser, isLoggedIn } from "@/lib/auth-client"
import { withReferralQuery } from "@/lib/referral"

const API = process.env.NEXT_PUBLIC_API_URL!

async function postPromptEvent(event: string) {
  try {
    const token = getToken()
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (token) headers.Authorization = `Bearer ${token}`
    await fetch(`${API}/install-prompt/`, {
      method: "POST",
      headers,
      body: JSON.stringify({ event }),
    })
  } catch {
    // Prompt tracking must never block push setup.
  }
}

function firstName() {
  const name = (getStoredUser()?.name || "").trim()
  return name.split(/\s+/)[0] || ""
}

function isAuthPath() {
  if (typeof window === "undefined") return false
  const path = window.location.pathname
  return (
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/verify")
  )
}

export function PushPrompt() {
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  const [hasAccount, setHasAccount] = useState(false)
  const [name, setName] = useState("")

  useEffect(() => {
    let cancelled = false

    async function checkPushStatus() {
      setHasAccount(isLoggedIn())
      setName(firstName())
      if (isAuthPath()) return
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        return
      }

      if (Notification.permission === "denied") return

      let subscription = await getPushSubscription()
      if (subscription) {
        try {
          await savePushSubscription(subscription)
          await postPromptEvent("installed")
          return
        } catch {
          // Continue to status check.
        }
      }

      if (cancelled) return

      const token = getToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`

      let endpoint = ""
      try {
        const existing = await getPushSubscription()
        endpoint = existing?.endpoint || ""
      } catch {
        endpoint = ""
      }

      const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""

      try {
        const response = await fetch(`${API}/push/status/${query}`, {
          headers,
          cache: "no-store",
        })
        const data = await response.json().catch(() => ({}))
        if (cancelled) return
        if (data.subscribed) {
          await postPromptEvent("installed")
          return
        }
        setShow(true)
        await postPromptEvent("shown")
      } catch {
        if (!cancelled) {
          setShow(true)
          await postPromptEvent("shown")
        }
      }
    }

    checkPushStatus()
    const onAuth = () => {
      setHasAccount(isLoggedIn())
      setName(firstName())
      void bindPushToAccount()
    }
    window.addEventListener("auth-changed", onAuth)

    return () => {
      cancelled = true
      window.removeEventListener("auth-changed", onAuth)
    }
  }, [])

  if (!show) return null

  const title = hasAccount
    ? name
      ? `${name}, we can tap you when a book is actually yours`
      : "Get a tap when a book is actually yours"
    : "Hear about a title before it disappears into the shelf"

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[69] mx-auto max-w-md rounded-2xl border bg-background p-4 shadow-lg">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        {hasAccount
          ? "Notifications are how PlugYard finds you after you close the site. We send a note written for you — here and by email — when you leave a page unfinished, when a new title matches how you read, or when someone uses your invite. That is the point of an account: the library can remember you."
          : "Without an account, PlugYard cannot keep your place or email you. Allow alerts on this phone now, then create a free account so the same personal notes follow you — unfinished pages, titles in your category, and invite rewards — instead of a generic blast."}
      </p>
      {msg ? <p className="mt-2 text-sm text-red-600">{msg}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={busy}
          className="flex-1 rounded-lg bg-black py-2 text-sm text-white disabled:opacity-50"
          onClick={async () => {
            setBusy(true)
            setMsg("")
            try {
              await enablePushNotifications()
              await postPromptEvent("installed")
              setShow(false)
            } catch (error) {
              setMsg(
                error instanceof Error
                  ? error.message
                  : "Failed to enable notifications",
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? "Enabling…" : "Allow personal alerts"}
        </button>
        {!hasAccount && (
          <Link
            href={withReferralQuery("/signup")}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            Create account
          </Link>
        )}
        <button
          disabled={busy}
          className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          onClick={async () => {
            await postPromptEvent("dismissed")
            setShow(false)
          }}
        >
          Later
        </button>
      </div>
    </div>
  )
}
