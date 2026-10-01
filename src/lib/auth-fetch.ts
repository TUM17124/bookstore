"use client"

import { getRefreshToken, getToken, refreshAccessToken, SessionEvictedError, tokenExpiresInMs } from "@/lib/api"

/**
 * One authenticated fetch for the Django API and the PDF service.
 *
 * - Attaches `Authorization: Bearer <access token>` (refreshing first if the
 *   stored token is missing/expired and a refresh token exists).
 * - On 401: ONE shared refresh (see refreshAccessToken — single-flight, so a
 *   burst of parallel requests causes one refresh), then retries once.
 * - Never fails silently: any network error, auth failure or non-2xx
 *   response throws an AuthFetchError whose `message` is fit to show the
 *   user (server `error`/`detail` when present).
 *
 * Callers own the UI: catch AuthFetchError and toast `err.message`.
 */

export class AuthFetchError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code = "") {
    super(message)
    this.name = "AuthFetchError"
    this.status = status
    this.code = code
  }
}

export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please log in again."
const NETWORK_MESSAGE = "Couldn't reach PlugYard. Check your connection and try again."

/** A message for the user from anything thrown by authFetch (or elsewhere). */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof AuthFetchError) return err.message
  if (err instanceof SessionEvictedError) return err.message
  return fallback
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

function withAuth(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers || {})
  if (token) headers.set("Authorization", `Bearer ${token}`)
  else headers.delete("Authorization")
  // Bearer auth, not cookies: never send credentials cross-origin.
  return { ...init, headers, credentials: "omit" }
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new AuthFetchError(NETWORK_MESSAGE, 0, "network")
  }
}

async function failure(res: Response): Promise<AuthFetchError> {
  const body = (await res.clone().json().catch(() => ({}))) as {
    error?: unknown
    detail?: unknown
    message?: unknown
    code?: unknown
  }
  const serverMsg = [body.error, body.detail, body.message].find((v) => typeof v === "string" && v.trim()) as
    | string
    | undefined
  const code = typeof body.code === "string" ? body.code : ""
  if (res.status === 401) return new AuthFetchError(SESSION_EXPIRED_MESSAGE, 401, code || "session_expired")
  if (res.status === 429) return new AuthFetchError("Too many requests — please wait a moment and try again.", 429, code)
  if (res.status >= 500) return new AuthFetchError(serverMsg || "The server had a problem. Please try again.", res.status, code)
  return new AuthFetchError(serverMsg || `Request failed (${res.status}).`, res.status, code)
}

export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await usableToken()
  let res = await send(url, withAuth(init, token))
  if (res.status === 401 && getRefreshToken()) {
    let fresh: string | null = null
    try {
      fresh = await refreshAccessToken(token)
    } catch (err) {
      if (err instanceof SessionEvictedError) throw new AuthFetchError(err.message, 401, "session_evicted")
      throw new AuthFetchError(SESSION_EXPIRED_MESSAGE, 401, "session_expired")
    }
    res = await send(url, withAuth(init, fresh))
  }
  if (!res.ok) throw await failure(res)
  return res
}

/** authFetch + parse JSON. */
export async function authFetchJson<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await authFetch(url, init)
  return (await res.json()) as T
}
