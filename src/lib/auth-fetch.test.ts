import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { _resetRefreshStateForTests, refreshAccessToken } from "./api"
import { AuthFetchError, SESSION_EXPIRED_MESSAGE, authFetch, errorMessage } from "./auth-fetch"

/** A JWT-shaped token whose payload carries `exp` (signature irrelevant). */
function jwt(expiresInSec: number, tag = "t"): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return `${b64({ alg: "HS256" })}.${b64({ exp: Math.floor(Date.now() / 1000) + expiresInSec, tag })}.sig`
}

function installStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  // @ts-expect-error - test global
  globalThis.localStorage = localStorage
  // @ts-expect-error - test global
  globalThis.window = { localStorage }
  return store
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

type Call = { url: string; auth: string | null }
let calls: Call[]
let refreshCalls: number

/** Fake network: the refresh endpoint plus a protected endpoint that only
 * accepts `accepted` tokens. */
function installFetch(opts: {
  accepted: Set<string>
  refreshResult?: () => Response | Promise<Response>
  protectedResult?: (auth: string | null) => Response
}) {
  calls = []
  refreshCalls = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes("/auth/refresh/")) {
      refreshCalls += 1
      await new Promise((r) => setTimeout(r, 5)) // let parallel callers pile up
      return opts.refreshResult ? opts.refreshResult() : json(200, { access: jwt(3600, "fresh") })
    }
    const auth = new Headers(init?.headers).get("Authorization")
    calls.push({ url, auth })
    if (opts.protectedResult) return opts.protectedResult(auth)
    const token = auth?.replace("Bearer ", "") ?? ""
    return opts.accepted.has(token) || token.includes(".") && JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).tag === "fresh"
      ? json(200, { ok: true })
      : json(401, { detail: "Given token not valid" })
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe("authFetch", () => {
  beforeEach(() => _resetRefreshStateForTests())
  afterEach(() => vi.restoreAllMocks())

  it("attaches the Bearer token", async () => {
    const token = jwt(3600, "valid")
    installStorage({ access_token: token, refresh_token: "r" })
    installFetch({ accepted: new Set([token]) })
    const res = await authFetch("https://pdf.test/api/pdf/annotations", { method: "POST" })
    expect(res.ok).toBe(true)
    expect(calls[0].auth).toBe(`Bearer ${token}`)
    expect(refreshCalls).toBe(0)
  })

  it("on 401 refreshes once and retries with the new token", async () => {
    const revoked = jwt(3600, "revoked") // looks valid locally, server rejects it
    const store = installStorage({ access_token: revoked, refresh_token: "r" })
    installFetch({ accepted: new Set() })
    const res = await authFetch("https://pdf.test/api/pdf/links", { method: "POST" })
    expect(res.ok).toBe(true)
    expect(refreshCalls).toBe(1)
    expect(calls).toHaveLength(2)
    expect(calls[0].auth).toBe(`Bearer ${revoked}`)
    expect(calls[1].auth).toBe(`Bearer ${store.get("access_token")}`)
    expect(calls[1].auth).not.toBe(calls[0].auth)
  })

  it("refreshes an expired token BEFORE sending (no wasted 401)", async () => {
    installStorage({ access_token: jwt(-60, "expired"), refresh_token: "r" })
    installFetch({ accepted: new Set() })
    await authFetch("https://pdf.test/api/pdf/structure", { method: "POST" })
    expect(refreshCalls).toBe(1)
    expect(calls).toHaveLength(1)
  })

  it("surfaces a session-expired error when the refresh fails", async () => {
    installStorage({ access_token: jwt(3600, "revoked"), refresh_token: "r" })
    installFetch({ accepted: new Set(), refreshResult: () => json(401, { detail: "Token is invalid or expired" }) })
    const err = await authFetch("https://pdf.test/api/pdf/attachments", { method: "POST" }).catch((e) => e)
    expect(err).toBeInstanceOf(AuthFetchError)
    expect(err.status).toBe(401)
    expect(err.message).toBe(SESSION_EXPIRED_MESSAGE)
    expect(calls).toHaveLength(1) // no retry without a fresh token
  })

  it("surfaces the server's error message", async () => {
    const token = jwt(3600, "valid")
    installStorage({ access_token: token, refresh_token: "r" })
    installFetch({ accepted: new Set([token]), protectedResult: () => json(422, { error: "This PDF has no text layer." }) })
    const err = await authFetch("https://pdf.test/api/pdf/text-style").catch((e) => e)
    expect(err).toBeInstanceOf(AuthFetchError)
    expect(err.status).toBe(422)
    expect(errorMessage(err)).toBe("This PDF has no text layer.")
  })

  it("surfaces network failures with a readable message", async () => {
    installStorage({ access_token: jwt(3600), refresh_token: "r" })
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    // A GET retries transient failures 3 times (0.5 s + 1 s + 3 s of real
    // backoff, plus jitter). Run on fake timers so the full retry path is
    // still exercised but the test no longer sits close to vitest's 5 s limit.
    vi.useFakeTimers()
    try {
      const pending = authFetch("https://pdf.test/api/pdf/annotations").catch((e) => e)
      await vi.runAllTimersAsync()
      const err = await pending
      expect(err).toBeInstanceOf(AuthFetchError)
      expect(err.code).toBe("network")
      expect(err.message).not.toMatch(/Failed to fetch/)
      expect(fetchMock).toHaveBeenCalledTimes(4) // first try + 3 retries
    } finally {
      vi.useRealTimers()
    }
  })

  it("a burst of parallel 401s causes ONE refresh (the production 429 storm)", async () => {
    installStorage({ access_token: jwt(3600, "revoked"), refresh_token: "r" })
    installFetch({ accepted: new Set() })
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => authFetch(`https://pdf.test/api/pdf/annotations?i=${i}`, { method: "POST" })),
    )
    expect(results.every((r) => r.ok)).toBe(true)
    expect(refreshCalls).toBe(1)
  })
})

describe("refreshAccessToken", () => {
  beforeEach(() => _resetRefreshStateForTests())

  it("fails fast during the cooldown after a failed refresh (no hammering)", async () => {
    installStorage({ access_token: jwt(-60), refresh_token: "r" })
    installFetch({ accepted: new Set(), refreshResult: () => json(429, { detail: "Request was throttled." }) })
    await expect(refreshAccessToken()).rejects.toThrow(/Too many/)
    await expect(refreshAccessToken()).rejects.toThrow(/Too many/)
    await expect(refreshAccessToken()).rejects.toThrow(/Too many/)
    expect(refreshCalls).toBe(1)
  })

  it("reuses a newer valid token (refreshed by another request or tab) without a network call", async () => {
    const stale = jwt(3600, "stale")
    const newer = jwt(3600, "newer")
    installStorage({ access_token: newer, refresh_token: "r" })
    installFetch({ accepted: new Set() })
    await expect(refreshAccessToken(stale)).resolves.toBe(newer)
    expect(refreshCalls).toBe(0)
  })
})
