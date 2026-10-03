"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bookmark, Smartphone, UserPlus } from "lucide-react"
import { getToken } from "@/lib/api"
import { getStoredUser, isLoggedIn } from "@/lib/auth-client"
import { withReferralQuery } from "@/lib/referral"
import { fill, useText } from "@/lib/site-config"

const API = process.env.NEXT_PUBLIC_API_URL!

function isStandalone() {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  )
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

export function InstallAndPush() {
  // Admin-editable (Django admin → Site: General → Install prompt).
  const t = {
    titleGuest: useText("install.title_guest"),
    titleAccount: useText("install.title_account"),
    titleNamed: useText("install.title_account_named"),
    introGuest: useText("install.intro_guest"),
    introAccount: useText("install.intro_account"),
    pointHome: useText("install.point_home"),
    pointPlaceAccount: useText("install.point_place_account"),
    pointPlaceGuest: useText("install.point_place_guest"),
    pointAccount: useText("install.point_account"),
    help: useText("install.help"),
    button: useText("install.button"),
    cta: useText("invite.cta"),
  }
  const [ask, setAsk] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [name, setName] = useState("")
  const [hint, setHint] = useState("")
  const deferred = useRef<any>(null)

  useEffect(() => {
    let alive = true
    const token = getToken()

    async function ping(body: any) {
      await fetch(`${API}/install-prompt/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }).catch(() => null)
    }

    async function init() {
      setSignedIn(isLoggedIn())
      setName(firstName())
      if (isStandalone() || isAuthPath()) {
        if (isStandalone()) await ping({ event: "installed" })
        return
      }

      const response = await fetch(`${API}/install-prompt/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      }).catch(() => null)

      const data = await response?.json().catch(() => ({}))
      if (!alive) return
      if (data?.ask) setAsk(true)
    }

    function onPrompt(event: any) {
      event.preventDefault()
      deferred.current = event
    }

    function onInstalled() {
      ping({ event: "installed" })
      setAsk(false)
    }

    function onAuth() {
      setSignedIn(isLoggedIn())
      setName(firstName())
    }

    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    window.addEventListener("auth-changed", onAuth)
    init()

    return () => {
      alive = false
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
      window.removeEventListener("auth-changed", onAuth)
    }
  }, [])

  if (!ask || isStandalone()) return null

  const title = signedIn ? (name ? fill(t.titleNamed, { name }) : t.titleAccount) : t.titleGuest

  return (
    <div className="fixed bottom-4 inset-x-0 z-[70] mx-auto w-[min(92%,440px)] rounded-2xl border bg-background p-4 shadow-xl">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-foreground/65">
        {signedIn ? t.introAccount : t.introGuest}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-foreground/70">
        <li className="flex gap-2">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
          <span>{t.pointHome}</span>
        </li>
        <li className="flex gap-2">
          <Bookmark className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
          <span>{signedIn ? t.pointPlaceAccount : t.pointPlaceGuest}</span>
        </li>
        {!signedIn && (
          <li className="flex gap-2">
            <UserPlus className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
            <span>{t.pointAccount}</span>
          </li>
        )}
      </ul>
      {hint ? <p className="mt-2 text-xs text-foreground/55">{hint}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded-full bg-foreground px-4 py-2 text-sm text-background"
          onClick={async () => {
            await pingInstallEvent("shown")
            if (deferred.current?.prompt) {
              deferred.current.prompt()
              const choice = await deferred.current.userChoice
              deferred.current = null
              if (choice?.outcome === "accepted") {
                await pingInstallEvent("installed")
                setAsk(false)
                return
              }
              await pingInstallEvent("dismissed")
              setAsk(false)
              return
            }
            setHint(t.help)
          }}
        >
          {t.button}
        </button>
        {!signedIn && (
          <Link
            href={withReferralQuery("/signup")}
            className="rounded-full border px-4 py-2 text-sm"
            onClick={() => pingInstallEvent("shown")}
          >
            {t.cta}
          </Link>
        )}
        <button
          className="rounded-full border px-4 py-2 text-sm"
          onClick={async () => {
            await pingInstallEvent("dismissed")
            setAsk(false)
          }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}

async function pingInstallEvent(event: string) {
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
    // Installation tracking must not block the UI.
  }
}
