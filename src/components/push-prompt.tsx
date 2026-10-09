"use client"

import { useEffect, useState } from "react"
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

const DISMISSED_KEY = "push_dismissed_at"
const DEFAULT_COOLDOWN_DAYS = 30

function isDismissedRecently(cooldownDays: number): boolean {
  if (cooldownDays === 0) return false
  try {
    const stored = localStorage.getItem(DISMISSED_KEY)
    if (!stored) return false
    const dismissedAt = parseInt(stored, 10)
    if (isNaN(dismissedAt)) return false
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000
    return Date.now() - dismissedAt < cooldownMs
  } catch {
    return false
  }
}

function saveDismissedAt() {
  try {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString())
  } catch {}
}

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
  const [denied, setDenied] = useState(false)
  const [msg, setMsg] = useState("")
  const [msgIsSoft, setMsgIsSoft] = useState(false)
  const [hasAccount, setHasAccount] = useState(false)
  const [name, setName] = useState("")
  const [cooldownDays, setCooldownDays] = useState(DEFAULT_COOLDOWN_DAYS)
  // Admin-editable (Django admin → Site: General → Push prompt).
  const guestTitle = useText("push.guest_title")
  const guestBody = useText("push.guest_body")
  const accountTitle = useText("push.account_title")
  const accountBody = useText("push.account_body")
  const buttonLabel = useText("push.button")

  useEffect(() => {
    let cancelled = false

    async function handleTrigger() {
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

      // Already subscribed — silently re-save and stop.
      const subscription = await getPushSubscription()
      if (subscription) {
        try {
          await savePushSubscription(subscription)
          await postPromptEvent("installed")
        } catch {}
        return
      }

      if (cancelled) return

      const token = getToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`

      try {
        const promptRes = await fetch(`${API}/install-prompt/`, {
          headers,
          cache: "no-store",
        })
        const promptData = await promptRes.json().catch(() => ({}))
        if (cancelled) return
        if (promptData.push_enabled === false) return
        if (promptData.push_prompt === false) return

        const days: number =
          typeof promptData.push_prompt_cooldown_days === "number"
            ? promptData.push_prompt_cooldown_days
            : DEFAULT_COOLDOWN_DAYS
        setCooldownDays(days)

        // Blocked users: show the Settings path instead of the browser prompt.
        if (Notification.permission === "denied") {
          setDenied(true)
          setShow(true)
          return
        }

        // Respect the "Not now" cooldown stored in localStorage.
        if (isDismissedRecently(days)) return

        setShow(true)
        await postPromptEvent("shown")
      } catch {
        if (!cancelled) {
          if (isDismissedRecently(DEFAULT_COOLDOWN_DAYS)) return
          setShow(true)
          await postPromptEvent("shown")
        }
      }
    }

    const onTrigger = () => {
      void handleTrigger()
    }
    window.addEventListener("push-prompt-trigger", onTrigger)

    const onAuth = () => {
      setHasAccount(isLoggedIn())
      setName(firstName())
      void bindPushToAccount()
    }
    window.addEventListener("auth-changed", onAuth)

    return () => {
      cancelled = true
      window.removeEventListener("push-prompt-trigger", onTrigger)
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

  // Notifications are blocked in the browser — guide the user to fix it.
  if (denied) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-[69] mx-auto max-w-md rounded-2xl border bg-background p-4 shadow-lg">
        <p className="font-semibold">Notifications are blocked</p>
        <p className="mt-1 text-sm text-foreground/70 dark:text-neutral-400">
          To receive PlugYard alerts, allow notifications in your browser settings:{" "}
          <span className="font-medium">Settings → Site settings → Notifications → Allow plugyard.com</span>.
        </p>
        <div className="mt-3">
          <button
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() => setShow(false)}
          >
            OK
          </button>
        </div>
      </div>
    )
  }

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
          <a
            href={withReferralQuery("/signup")}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            Create account
          </a>
        )}
        <button
          disabled={busy}
          className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          onClick={async () => {
            saveDismissedAt()
            await postPromptEvent("dismissed")
            setShow(false)
          }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}
