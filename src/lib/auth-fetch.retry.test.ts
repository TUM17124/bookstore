import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { _resetRefreshStateForTests } from "./api"
import {
  AuthFetchError,
  MAX_RETRY_AFTER_MS,
  RETRY_DELAYS_MS,
  RETRY_JITTER,
  authFetch,
  backoffDelay,
  newIdempotencyKey,
  retryAfterMs,
  type RetryInfo,
} from "./auth-fetch"

// Part A: automatic retries for transient failures only.

function jwt(expiresInSec: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return `${b64({ alg: "HS256" })}.${b64({ exp: Math.floor(Date.now() / 1000) + expiresInSec })}.sig`
}

function installStorage() {
  const store = new Map<string, string>([
    ["access_token", jwt(3600)],
    ["refresh_token", "r"],
  ])
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  // @ts-expect-error - test global
  globalThis.localStorage = localStorage
  // @ts-expect-error - test global
  globalThis.window = { localStorage }
}

const json = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })

type Step = Response | "network" | "hang" | ((init: RequestInit) => Response)
let sent: { url: string; init: RequestInit }[]

/** fetch that answers with `steps` in order (the last one repeats). */
function script(...steps: Step[]) {
  sent = []
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    sent.push({ url: String(input), init })
    const step = steps[Math.min(sent.length - 1, steps.length - 1)]
    if (step === "network") throw new TypeError("Failed to fetch")
    if (step === "hang") {
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
      })
    }
    if (typeof step === "function") return step(init)
    return step.clone()
  }) as unknown as typeof fetch
}

const header = (i: number, name: string) => new Headers(sent[i].init.headers).get(name)

/** Runs `p` while fast-forwarding every timer it schedules. */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false
  p.then(
    () => (done = true),
    () => (done = true),
  )
  for (let i = 0; i < 50 && !done; i++) await vi.runAllTimersAsync()
  return p
}

beforeEach(() => {
  _resetRefreshStateForTests()
  installStorage()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("backoff schedule", () => {
  it("is ~0.5 s, 1 s, 3 s with jitter inside ±20%", () => {
    expect(RETRY_DELAYS_MS).toEqual([500, 1000, 3000])
    RETRY_DELAYS_MS.forEach((base, i) => {
      expect(backoffDelay(i + 1, () => 0)).toBe(Math.round(base * (1 - RETRY_JITTER)))
      expect(backoffDelay(i + 1, () => 0.5)).toBe(base)
      expect(backoffDelay(i + 1, () => 0.999999)).toBe(Math.round(base * (1 + RETRY_JITTER)))
      for (let n = 0; n < 200; n++) {
        const d = backoffDelay(i + 1)
        expect(d).toBeGreaterThanOrEqual(base * (1 - RETRY_JITTER))
        expect(d).toBeLessThanOrEqual(base * (1 + RETRY_JITTER))
      }
    })
  })

  it("GET: retries 503 three times on that schedule, then succeeds", async () => {
    script(json(503), json(503), json(503), json(200, { ok: true }))
    const retries: RetryInfo[] = []
    const res = await settle(authFetch("https://api.test/x", { onRetry: (r) => retries.push(r) }))
    expect(res.status).toBe(200)
    expect(sent).toHaveLength(4)
    expect(retries.map((r) => r.attempt)).toEqual([1, 2, 3])
    retries.forEach((r, i) => {
      const base = RETRY_DELAYS_MS[i]
      expect(r.delayMs).toBeGreaterThanOrEqual(base * (1 - RETRY_JITTER))
      expect(r.delayMs).toBeLessThanOrEqual(base * (1 + RETRY_JITTER))
      expect(r.reason).toBe("http_503")
    })
  })

  it("gives up after 3 retries and surfaces the error", async () => {
    script(json(502))
    const err = await settle(authFetch("https://api.test/x")).catch((e) => e)
    expect(err).toBeInstanceOf(AuthFetchError)
    expect(err.status).toBe(502)
    expect(sent).toHaveLength(4)
  })

  it.each([429, 502, 503, 504])("treats %i as transient", async (status) => {
    script(json(status), json(200))
    expect((await settle(authFetch("https://api.test/x"))).status).toBe(200)
    expect(sent).toHaveLength(2)
  })

  it("retries network failures and timeouts", async () => {
    script("network", "hang", json(200))
    const reasons: string[] = []
    const res = await settle(authFetch("https://api.test/x", { timeoutMs: 1000, onRetry: (r) => reasons.push(r.reason) }))
    expect(res.status).toBe(200)
    expect(reasons).toEqual(["network", "timeout"])
  })
})

describe("Retry-After", () => {
  it("parses seconds and HTTP dates", () => {
    expect(retryAfterMs(json(429, {}, { "Retry-After": "2" }))).toBe(2000)
    const now = Date.parse("2026-10-01T10:00:00Z")
    expect(retryAfterMs(json(503, {}, { "Retry-After": "Thu, 01 Oct 2026 10:00:05 GMT" }), now)).toBe(5000)
    expect(retryAfterMs(json(503))).toBeNull()
  })

  it("is honoured on 429 instead of the backoff", async () => {
    script(json(429, {}, { "Retry-After": "2" }), json(200))
    const retries: RetryInfo[] = []
    await settle(authFetch("https://api.test/x", { onRetry: (r) => retries.push(r) }))
    expect(retries[0].delayMs).toBeGreaterThanOrEqual(2000)
    expect(retries[0].delayMs).toBeLessThanOrEqual(2250)
  })

  it("is honoured on 503", async () => {
    script(json(503, {}, { "Retry-After": "1" }), json(200))
    const retries: RetryInfo[] = []
    await settle(authFetch("https://api.test/x", { onRetry: (r) => retries.push(r) }))
    expect(retries[0].delayMs).toBeGreaterThanOrEqual(1000)
    expect(retries[0].delayMs).toBeLessThanOrEqual(1250)
  })

  it("a wait longer than the cap is not waited out: the error says when to try", async () => {
    script(json(429, {}, { "Retry-After": String(MAX_RETRY_AFTER_MS / 1000 + 30) }))
    const err = await settle(authFetch("https://api.test/x")).catch((e) => e)
    expect(sent).toHaveLength(1)
    expect(err.status).toBe(429)
    expect(err.message).toMatch(/Try again in 60 s/)
  })
})

describe("never retried", () => {
  it.each([400, 403, 404, 409, 422])("GET %i fails at once", async (status) => {
    script(json(status, { error: `bad ${status}` }), json(200))
    const err = await settle(authFetch("https://api.test/x")).catch((e) => e)
    expect(err.status).toBe(status)
    expect(err.message).toBe(`bad ${status}`)
    expect(sent).toHaveLength(1)
  })

  it("401 only triggers the single token refresh, not the retry loop", async () => {
    sent = []
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      sent.push({ url: String(input), init })
      if (String(input).includes("/auth/refresh/")) return json(401, { detail: "expired" })
      return json(401)
    }) as unknown as typeof fetch
    const err = await settle(authFetch("https://api.test/x")).catch((e) => e)
    expect(err.status).toBe(401)
    expect(sent.filter((s) => !s.url.includes("/auth/refresh/"))).toHaveLength(1)
  })

  it("POST without an idempotency key is not retried, even on 503", async () => {
    script(json(503), json(200))
    const err = await settle(authFetch("https://api.test/x", { method: "POST", body: "{}" })).catch((e) => e)
    expect(err.status).toBe(503)
    expect(sent).toHaveLength(1)
    expect(header(0, "Idempotency-Key")).toBeNull()
  })

  it.each(["PUT", "PATCH", "DELETE"])("%s without a key is not retried", async (method) => {
    script("network", json(200))
    const err = await settle(authFetch("https://api.test/x", { method })).catch((e) => e)
    expect(err.code).toBe("network")
    expect(sent).toHaveLength(1)
  })
})

describe("idempotent writes", () => {
  it("POST with a key retries and sends the SAME key every time", async () => {
    script("network", json(503), json(201, { id: 7 }))
    const key = newIdempotencyKey()
    const res = await settle(authFetch("https://api.test/checkout/", { method: "POST", body: "{}", idempotencyKey: key }))
    expect(res.status).toBe(201)
    expect(sent).toHaveLength(3)
    expect(sent.map((_, i) => header(i, "Idempotency-Key"))).toEqual([key, key, key])
  })

  it("the key survives the 401 refresh too", async () => {
    let n = 0
    sent = []
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      sent.push({ url: String(input), init })
      if (String(input).includes("/auth/refresh/")) return json(200, { access: jwt(3600) })
      n += 1
      return n === 1 ? json(401) : n === 2 ? json(503) : json(200)
    }) as unknown as typeof fetch
    const key = newIdempotencyKey()
    await settle(authFetch("https://api.test/x", { method: "POST", idempotencyKey: key }))
    const keys = sent.filter((s) => !s.url.includes("/auth/refresh/")).map((s) => new Headers(s.init.headers).get("Idempotency-Key"))
    expect(keys).toEqual([key, key, key])
  })

  it("`pure` POSTs (stateless PDF service) retry without a key", async () => {
    script(json(504), json(200))
    const res = await settle(authFetch("https://pdf.test/pdf/structure", { method: "POST", pure: true }))
    expect(res.status).toBe(200)
    expect(sent).toHaveLength(2)
    expect(header(1, "Idempotency-Key")).toBeNull()
  })

  it("`pure` requests never send an Idempotency-Key, even if one is passed", async () => {
    script(json(200))
    await settle(authFetch("https://pdf.test/pdf/structure", { method: "POST", pure: true, idempotencyKey: newIdempotencyKey() }))
    expect(header(0, "Idempotency-Key")).toBeNull()
  })

  it("keys are unique per action", () => {
    const keys = new Set(Array.from({ length: 500 }, newIdempotencyKey))
    expect(keys.size).toBe(500)
    for (const k of keys) expect(k).toMatch(/^[A-Za-z0-9_-]{8,100}$/)
  })
})

describe("cancellation", () => {
  it("aborting during the backoff stops further attempts", async () => {
    script(json(503))
    const ctrl = new AbortController()
    const p = authFetch("https://api.test/x", { signal: ctrl.signal, onRetry: () => ctrl.abort() })
    const err = await settle(p).catch((e) => e)
    expect(err.code).toBe("aborted")
    expect(sent).toHaveLength(1)
  })

  it("aborting an in-flight request reports 'aborted', not a network error", async () => {
    script("hang")
    const ctrl = new AbortController()
    const p = authFetch("https://api.test/x", { signal: ctrl.signal })
    ctrl.abort()
    const err = await settle(p).catch((e) => e)
    expect(err.code).toBe("aborted")
  })

  it("an already-aborted signal sends nothing", async () => {
    script(json(200))
    const ctrl = new AbortController()
    ctrl.abort()
    const err = await settle(authFetch("https://api.test/x", { signal: ctrl.signal })).catch((e) => e)
    expect(err.code).toBe("aborted")
    expect(sent).toHaveLength(0)
  })
})

describe("auth: false", () => {
  it("never attaches a token", async () => {
    script(json(200))
    await settle(authFetch("https://api.test/auth/login/", { method: "POST", auth: false }))
    expect(header(0, "Authorization")).toBeNull()
  })
})
