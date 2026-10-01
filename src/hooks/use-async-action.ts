"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  errorMessage,
  isAbortError,
  newIdempotencyKey,
  type RetryInfo,
} from "@/lib/auth-fetch"

/**
 * One state machine for every button that triggers a request or a long
 * action (Part A):
 *
 *   idle → loading (→ retrying, with a countdown) → success (briefly) → idle
 *                                                 ↘ error ("Try again")
 *
 * - `run(...args)` is ignored while one is already running (no double
 *   submit), so a double-click can't send the request twice.
 * - Every run gets an AbortSignal and an idempotency key to pass to the
 *   request (`ctx`). The key is REUSED when the user tries the same action
 *   again after a failure (same arguments), so a request that actually
 *   succeeded on the server — but whose answer was lost — is replayed, not
 *   repeated. A new action (different arguments, or after a success) gets a
 *   new key.
 * - A new run cancels the previous one's pending retries; leaving the page
 *   (unmount or pagehide) cancels too. Cancellation is not an error.
 */

export type ActionState = "idle" | "loading" | "retrying" | "success" | "error"

/** Passed to the action; spread it into the request (it is a CallOptions). */
export type ActionContext = {
  signal: AbortSignal
  idempotencyKey: string
  onRetry: (info: RetryInfo) => void
}

export type RetryStatus = RetryInfo & { secondsLeft: number }

export type AsyncAction<A extends unknown[], T> = {
  state: ActionState
  busy: boolean
  error: unknown
  /** User-facing error text ("" when no error). */
  errorText: string
  retry: RetryStatus | null
  run: (...args: A) => Promise<T | undefined>
  cancel: () => void
  reset: () => void
}

export type AsyncActionOptions<T> = {
  /** How long the success state shows before returning to idle (ms). 0 = skip. */
  successMs?: number
  /** Fallback error text when the error carries no user-facing message. */
  errorFallback?: string
  onSuccess?: (result: T) => void
  onError?: (err: unknown) => void
}

/** Stable comparison of action arguments (Files/FormData by identity-ish fields). */
export function argsSignature(args: unknown[]): string | null {
  try {
    return JSON.stringify(args, (_k, v) => {
      if (typeof File !== "undefined" && v instanceof File) return { file: v.name, size: v.size, mod: v.lastModified }
      if (typeof Blob !== "undefined" && v instanceof Blob) return { blob: v.size, type: v.type }
      if (typeof FormData !== "undefined" && v instanceof FormData) return { form: [...v.entries()] }
      if (typeof v === "function") return undefined
      return v
    })
  } catch {
    return null
  }
}

export function useAsyncAction<A extends unknown[], T>(
  fn: (ctx: ActionContext, ...args: A) => Promise<T>,
  options: AsyncActionOptions<T> = {},
): AsyncAction<A, T> {
  const { successMs = 1500, errorFallback } = options
  const [state, setState] = useState<ActionState>("idle")
  const [error, setError] = useState<unknown>(null)
  const [retry, setRetry] = useState<RetryStatus | null>(null)

  // Latest fn/options for run() without re-creating it every render.
  // Synced after each commit (clicks always come after a commit).
  const fnRef = useRef(fn)
  const optsRef = useRef(options)
  useEffect(() => {
    fnRef.current = fn
    optsRef.current = options
  })

  const mounted = useRef(true)
  const running = useRef(false)
  const ctrlRef = useRef<AbortController | null>(null)
  const keyRef = useRef<string | null>(null)
  const lastFailedSig = useRef<string | null>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryUntil = useRef(0)

  const cancel = useCallback(() => {
    ctrlRef.current?.abort()
    ctrlRef.current = null
  }, [])

  useEffect(() => {
    mounted.current = true
    const onHide = () => cancel()
    window.addEventListener("pagehide", onHide)
    return () => {
      mounted.current = false
      window.removeEventListener("pagehide", onHide)
      cancel()
      if (successTimer.current) clearTimeout(successTimer.current)
    }
  }, [cancel])

  // Countdown for "retrying in N s".
  useEffect(() => {
    if (state !== "retrying") return
    const id = setInterval(() => {
      setRetry((r) => (r ? { ...r, secondsLeft: Math.max(0, Math.ceil((retryUntil.current - Date.now()) / 1000)) } : r))
    }, 250)
    return () => clearInterval(id)
  }, [state])

  const run = useCallback(
    async (...args: A): Promise<T | undefined> => {
      if (running.current) return undefined
      running.current = true
      if (successTimer.current) clearTimeout(successTimer.current)
      cancel()
      const ctrl = new AbortController()
      ctrlRef.current = ctrl

      const sig = argsSignature(args)
      if (!keyRef.current || sig === null || sig !== lastFailedSig.current) keyRef.current = newIdempotencyKey()

      setState("loading")
      setError(null)
      setRetry(null)

      const onRetry = (info: RetryInfo) => {
        if (!mounted.current || ctrl.signal.aborted) return
        retryUntil.current = Date.now() + info.delayMs
        setRetry({ ...info, secondsLeft: Math.ceil(info.delayMs / 1000) })
        setState("retrying")
      }

      try {
        const result = await fnRef.current({ signal: ctrl.signal, idempotencyKey: keyRef.current, onRetry }, ...args)
        if (ctrl.signal.aborted) return undefined
        lastFailedSig.current = null
        keyRef.current = null // next action, next key
        if (mounted.current) {
          setRetry(null)
          if (successMs > 0) {
            setState("success")
            successTimer.current = setTimeout(() => mounted.current && setState("idle"), successMs)
          } else {
            setState("idle")
          }
        }
        optsRef.current.onSuccess?.(result)
        return result
      } catch (err) {
        if (isAbortError(err) || ctrl.signal.aborted) {
          if (mounted.current) {
            setRetry(null)
            setState("idle")
          }
          return undefined
        }
        lastFailedSig.current = sig
        if (mounted.current) {
          setRetry(null)
          setError(err)
          setState("error")
        }
        optsRef.current.onError?.(err)
        return undefined
      } finally {
        running.current = false
        if (ctrlRef.current === ctrl) ctrlRef.current = null
      }
    },
    [cancel, successMs],
  )

  const reset = useCallback(() => {
    cancel()
    if (successTimer.current) clearTimeout(successTimer.current)
    setState("idle")
    setError(null)
    setRetry(null)
  }, [cancel])

  return {
    state,
    busy: state === "loading" || state === "retrying",
    error,
    errorText: state === "error" ? errorMessage(error, errorFallback) : "",
    retry,
    run,
    cancel,
    reset,
  }
}
