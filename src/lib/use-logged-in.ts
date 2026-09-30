"use client"

import { useSyncExternalStore } from "react"
import { getToken } from "@/lib/api"

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  return () => window.removeEventListener("storage", onChange)
}

/** Whether an access token is stored. `false` during static prerender and
 * the first hydration pass, then the real value — no hydration mismatch. */
export function useLoggedIn(): boolean {
  return useSyncExternalStore(subscribe, () => !!getToken(), () => false)
}
