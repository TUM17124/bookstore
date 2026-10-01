"use client"

import { useSyncExternalStore } from "react"

/**
 * A small site-wide value loaded from the API (categories, marquee copy…)
 * that paints instantly from this browser's last copy (localStorage), then
 * refreshes from the server once per `ttlMs`, shared by every component
 * that uses it. Static export safe: the server render and hydration use
 * `fallback`, the stored/fresh value follows straight after.
 */
export function cachedResource<T>(
  key: string,
  load: () => Promise<T | null | undefined>,
  fallback: T,
  ttlMs = 30_000,
) {
  let value: T | null = null
  let cacheRead = false
  let loadedAt = 0
  let inflight: Promise<void> | null = null
  const listeners = new Set<() => void>()

  function readCache() {
    cacheRead = true
    try {
      const raw = localStorage.getItem(key)
      if (raw) value = JSON.parse(raw) as T
    } catch {
      // no / unreadable cache: fallback until the server answers
    }
  }

  function refresh() {
    if (inflight || (loadedAt && Date.now() - loadedAt < ttlMs)) return
    inflight = load()
      .then((fresh) => {
        if (fresh == null) return
        value = fresh
        loadedAt = Date.now()
        try {
          localStorage.setItem(key, JSON.stringify(fresh))
        } catch {
          // private mode: still shown, just not remembered
        }
        listeners.forEach((l) => l())
      })
      .catch(() => {
        // offline / API down: keep the stored or built-in value
      })
      .finally(() => {
        inflight = null
      })
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    refresh()
    return () => {
      listeners.delete(listener)
    }
  }

  function getSnapshot(): T | null {
    if (!cacheRead) readCache()
    return value
  }

  /** `[value, ready]` — ready once a stored or fresh value exists. */
  return function useResource(): [T, boolean] {
    const v = useSyncExternalStore(subscribe, getSnapshot, () => null)
    return [v ?? fallback, v !== null]
  }
}
