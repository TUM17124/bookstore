"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getToken } from "@/lib/api"
import {
  bindPushToAccount,
  enablePushNotifications,
  getPushSubscription,
  PushSubscribeError,
  savePushSubscription,
} from "@/lib/push"
import { useAsyncAction } from "@/hooks/use-async-action"
import { ActionButton } from "@/components/ui/action-button"
import { getStoredUser, isLoggedIn } from "@/lib/auth-client"
import { withReferralQuery } from "@/lib/referral"
import { personalize } from "@/lib/prompts"
import { useText } from "@/lib/site-config"

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
  const [msgIsSoft, setMsgIsSoft] = useState(false)
  const [hasAccount, setHasAccount] = useState(false)
  const [name, setName] = useState("")
  // Admin-editable (Django admin → Site: General → Push prompt).
  const guestTitle = useText("push.guest_title")
  const guestBody = useText("push.guest_body")
  const accountTitle = useText("push.account_title")
  const accountBody = useText("push.account_body")
  const buttonLabel = useText("push.button")

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
        const promptRes = await fetch(`${API}/install-prompt/`, {
          headers,
          cache: "no-store",
        })
        const promptData = await promptRes.json().catch(() => ({}))
        if (cancelled) return
        if (promptData.push_enabled === false) return
        if (promptData.push_prompt === false) return // Site: Features → push prompt off
        if (promptData.installed) {
          await postPromptEvent("installed")
          return
        }
        // The backend's `ask` flag is the authoritative answer (cooldown,
        // dismissed status, and the prompt_count cap all factor in) — a
        // local "not subscribed yet" check alone would keep re-showing the
        // prompt after "Later" forever, since dismissing never subscribes.
        if (!promptData.ask) return

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

  const enable = useAsyncAction(
    // Browser permission + push subscription; not an API retry candidate.
    async () => {
      await enablePushNotifications()
      await postPromptEvent("installed")
    },
    {
      successMs: 0,
      onSuccess: () => setShow(false),
      onError: (error) => {
        // A failed push subscription (e.g. Brave blocking it by default) is
        // routine, not a blocking error — surface it as a quiet note and
        // leave Create account / Later fully usable.
        setMsgIsSoft(error instanceof PushSubscribeError)
        setMsg(error instanceof Error ? error.message : "Could not enable notifications on this device.")
      },
    },
  )
  const busy = enable.busy

  if (!show) return null

  const title = personalize(hasAccount ? accountTitle : guestTitle, name)
  const body = personalize(hasAccount ? accountBody : guestBody, name)

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[69] mx-auto max-w-md rounded-2xl border bg-background p-4 shadow-lg">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-foreground/70 dark:text-neutral-400">{body}</p>
      {msg ? (
        <p
          role={msgIsSoft ? "status" : "alert"}
          className={`mt-2 text-sm ${msgIsSoft ? "text-muted-foreground dark:text-neutral-400" : "text-red-600"}`}
        >
          {msg}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton
          action={enable}
          onClick={() => {
            setMsg("")
            setMsgIsSoft(false)
            void enable.run()
          }}
          loadingLabel="Enabling…"
          errorLabel={buttonLabel}
          errorPlacement="none"
          className="flex-1 rounded-lg bg-foreground py-2 text-sm text-background disabled:opacity-50"
        >
          {buttonLabel}
        </ActionButton>
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
