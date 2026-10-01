"use client"

import { getRefreshToken, getToken, refreshAccessToken, SessionEvictedError, tokenExpiresInMs } from "@/lib/api"
import { UserError } from "@/lib/user-error"

export { UserError }

/**
 * One fetch for the Django API and the PDF service.
 *
 * - Attaches `Authorization: Bearer <access token>` (refreshing first if the
 *   stored token is missing/expired and a refresh token exists). `auth: false`
 *   sends no token at all (login, register, guest flows).
 * - On 401: ONE shared refresh (see refreshAccessToken — single-flight, so a
 *   burst of parallel requests causes one refresh), then retries once.
 * - Retries TRANSIENT failures only — network errors, timeouts, 429, 502,
 *   503, 504 — up to 3 times at ~0.5 s, 1 s, 3 s (±20% jitter), honouring
 *   `Retry-After` on 429/503. Never retries any other 4xx.
 * - Which requests may be retried:
 *     GET/HEAD                       always;
 *     POST/PUT/PATCH/DELETE          only with `idempotencyKey` (sent as the
 *                                    `Idempotency-Key` header, the SAME key on
 *                                    every retry; the backend replays the
 *                                    first response instead of acting twice —
 *                                    see bookstore_backend shop/idempotency.py),
 *                                    or `pure: true` for stateless compute
 *                                    endpoints (the PDF service: PDF in,
 *                                    result out, nothing stored).
 * - `signal` cancels the request and any pending retry (page left, or a new
 *   action started). A cancelled call throws AuthFetchError code "aborted".
 * - Never fails silently: every failure throws an AuthFetchError whose
 *   `message` is fit to show the user (server `error`/`detail` when present).
 */

export class AuthFetchError extends UserError {
  status: number
  code: string
  /** Parsed JSON body of the failed response, when there was one. */
  body: Record<string, unknown>
  constructor(message: string, status: number, code = "", body: Record<string, unknown> = {}) {
    super(message)
    this.name = "AuthFetchError"
    this.status = status
    this.code = code
    this.body = body
  }
}

export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please log in again."
const NETWORK_MESSAGE = "Couldn't reach PlugYard. Check your connection and try again."
const TIMEOUT_MESSAGE = "The server took too long to answer. Please try again."
const ABORTED_MESSAGE = "Cancelled."

/** Delays before retry 1, 2, 3 (ms), before jitter. */
export const RETRY_DELAYS_MS = [500, 1000, 3000] as const
export const RETRY_JITTER = 0.2
/** A Retry-After longer than this is not waited out; the error is shown. */
export const MAX_RETRY_AFTER_MS = 30_000
const DEFAULT_GET_TIMEOUT_MS = 30_000

export type RetryInfo = {
  /** 1-based number of the retry about to happen. */
  attempt: number
  maxRetries: number
  delayMs: number
  /** Why: "network" | "timeout" | "http_429" | "http_503" ... */
  reason: string
}

export type RequestOptions = {
  signal?: AbortSignal | null
  /** Makes a POST/PUT/PATCH/DELETE retryable; reuse it across retries. */
  idempotencyKey?: string
  /** Stateless compute endpoint: retry a POST without an idempotency key. */
  pure?: boolean
  /** Max retries for transient failures (default 3; 0 disables). */
  retries?: number
  /** Per-attempt timeout. Default 30 s for GET/HEAD, none otherwise. */
  timeoutMs?: number
  onRetry?: (info: RetryInfo) => void
  /** Default true. false: never attach or refresh a token. */
  auth?: boolean
}

/** The subset a UI action passes down to the request it triggers. */
export type CallOptions = Pick<RequestOptions, "signal" | "idempotencyKey" | "onRetry" | "timeoutMs">

/** A message for the user from anything thrown by authFetch (or elsewhere). */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof AuthFetchError) return err.message
  if (err instanceof SessionEvictedError) return err.message
  if (err instanceof UserError && err.message) return err.message
  return fallback
}

/** True when the error only means "the user/page cancelled this". */
export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof AuthFetchError && err.code === "aborted") ||
    (err instanceof DOMException && err.name === "AbortError")
  )
}

/** A fresh key for one user action (all retries of it share the key). */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return `act_${c.randomUUID().replace(/-/g, "")}`
  return `act_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

async function usableToken(): Promise<string | null> {
  const token = getToken()
  const left = tokenExpiresInMs(token)
  if (token && (left === null || left > 30_000)) return token
  if (!getRefreshToken()) return token
  try {
    return await refreshAccessToken(token)
  } catch {
    return token // let the server answer 401; handled below
  }
}

function buildInit(init: RequestInit, token: string | null, idempotencyKey?: string): RequestInit {
  const headers = new Headers(init.headers || {})
  if (token) headers.set("Authorization", `Bearer ${token}`)
  else headers.delete("Authorization")
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey)
  // Bearer auth, not cookies: never send credentials cross-origin.
  return { ...init, headers, credentials: "omit" }
}

/** One network attempt, with an optional timeout, linked to the caller's signal. */
async function send(url: string, init: RequestInit, signal: AbortSignal | null | undefined, timeoutMs: number): Promise<Response> {
  if (signal?.aborted) throw new AuthFetchError(ABORTED_MESSAGE, 0, "aborted")
  const ctrl = new AbortController()
  let timedOut = false
  const onAbort = () => ctrl.abort()
  signal?.addEventListener("abort", onAbort, { once: true })
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          ctrl.abort()
        }, timeoutMs)
      : null
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch {
    if (signal?.aborted) throw new AuthFetchError(ABORTED_MESSAGE, 0, "aborted")
    if (timedOut) throw new AuthFetchError(TIMEOUT_MESSAGE, 0, "timeout")
    throw new AuthFetchError(NETWORK_MESSAGE, 0, "network")
  } finally {
    if (timer) clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
  }
}

async function failure(res: Response): Promise<AuthFetchError> {
  const body = (await res.clone().json().catch(() => ({}))) as Record<string, unknown>
  const serverMsg =
    ([body.error, body.detail, body.message].find((v) => typeof v === "string" && v.trim()) as string | undefined) ??
    firstFieldError(body)
  const code = typeof body.code === "string" ? body.code : ""
  if (res.status === 401) return new AuthFetchError(SESSION_EXPIRED_MESSAGE, 401, code || "session_expired", body)
  if (res.status === 429) {
    const wait = retryAfterMs(res)
    const hint = wait && wait > 1000 ? ` Try again in ${Math.ceil(wait / 1000)} s.` : " Please wait a moment and try again."
    return new AuthFetchError(`Too many requests.${hint}`, 429, code, body)
  }
  if (res.status >= 500) return new AuthFetchError(serverMsg || "The server had a problem. Please try again.", res.status, code, body)
  return new AuthFetchError(serverMsg || `Request failed (${res.status}).`, res.status, code, body)
}

/** DRF validation bodies look like {"email": ["Enter a valid email."]}. */
function firstFieldError(body: Record<string, unknown>): string | undefined {
  for (const value of Object.values(body)) {
    if (typeof value === "string" && value.trim()) return value
    if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0]
  }
  return undefined
}

const TRANSIENT_STATUS = new Set([429, 502, 503, 504])

/** Retry-After (seconds or HTTP date) in ms, or null. */
export function retryAfterMs(res: Response, now = Date.now()): number | null {
  const raw = res.headers.get("Retry-After")
  if (!raw) return null
  const secs = Number(raw)
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000)
  const at = Date.parse(raw)
  return Number.isNaN(at) ? null : Math.max(0, at - now)
}

/** Delay before retry number `attempt` (1-based), jittered ±RETRY_JITTER. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length) - 1]
  return Math.round(base * (1 + (random() * 2 - 1) * RETRY_JITTER))
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AuthFetchError(ABORTED_MESSAGE, 0, "aborted"))
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new AuthFetchError(ABORTED_MESSAGE, 0, "aborted"))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function mayRetry(method: string, init: RequestInit, opts: RequestOptions): boolean {
  if (typeof ReadableStream !== "undefined" && init.body instanceof ReadableStream) return false // can't resend
  if (method === "GET" || method === "HEAD") return true
  return !!opts.idempotencyKey || !!opts.pure
}

export async function authFetch(url: string, init: RequestInit & RequestOptions = {}): Promise<Response> {
  const { signal, idempotencyKey, pure, retries, timeoutMs, onRetry, auth = true, ...rest } = init
  const opts: RequestOptions = { idempotencyKey, pure }
  const method = (rest.method || "GET").toUpperCase()
  const maxRetries = mayRetry(method, rest, opts) ? Math.max(0, retries ?? RETRY_DELAYS_MS.length) : 0
  const perAttemptTimeout = timeoutMs ?? (method === "GET" || method === "HEAD" ? DEFAULT_GET_TIMEOUT_MS : 0)

  let token = auth ? await usableToken() : null
  let refreshed = false

  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null
    let transient: { reason: string; error: AuthFetchError; wait: number | null } | null = null
    try {
      res = await send(url, buildInit(rest, token, idempotencyKey), signal, perAttemptTimeout)
      if (res.status === 401 && auth && !refreshed && getRefreshToken()) {
        refreshed = true
        try {
          token = await refreshAccessToken(token)
        } catch (err) {
          if (err instanceof SessionEvictedError) throw new AuthFetchError(err.message, 401, "session_evicted")
          throw new AuthFetchError(SESSION_EXPIRED_MESSAGE, 401, "session_expired")
        }
        res = await send(url, buildInit(rest, token, idempotencyKey), signal, perAttemptTimeout)
      }
      if (res.ok) return res
      if (!TRANSIENT_STATUS.has(res.status)) throw await failure(res)
      transient = {
        reason: `http_${res.status}`,
        error: await failure(res),
        wait: res.status === 429 || res.status === 503 ? retryAfterMs(res) : null,
      }
    } catch (err) {
      if (!(err instanceof AuthFetchError) || (err.code !== "network" && err.code !== "timeout")) throw err
      transient = { reason: err.code, error: err, wait: null }
    }

    if (attempt >= maxRetries) throw transient.error
    if (transient.wait !== null && transient.wait > MAX_RETRY_AFTER_MS) throw transient.error
    const delayMs =
      transient.wait !== null ? transient.wait + Math.round(Math.random() * 250) : backoffDelay(attempt + 1)
    onRetry?.({ attempt: attempt + 1, maxRetries, delayMs, reason: transient.reason })
    await sleep(delayMs, signal)
  }
}

/** authFetch + parse JSON. */
export async function authFetchJson<T = unknown>(url: string, init: RequestInit & RequestOptions = {}): Promise<T> {
  const res = await authFetch(url, init)
  return (await res.json()) as T
}
