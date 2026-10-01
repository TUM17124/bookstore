import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  globalThis.window = { localStorage, dispatchEvent: () => true }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

let bookCalls: (string | null)[]

function installFetch(acceptToken: (auth: string | null) => boolean, refreshOk = true) {
  bookCalls = []
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes("/auth/refresh/")) {
      return refreshOk ? json(200, { access: jwt(3600, "fresh") }) : json(401, { detail: "Token is invalid" })
    }
    const auth = new Headers(init?.headers).get("Authorization")
    bookCalls.push(auth)
    return acceptToken(auth) ? json(200, { results: [{ id: 1, title: "A" }] }) : json(401, { detail: "Given token not valid" })
  }) as unknown as typeof fetch
}

async function loadGetBooks() {
  vi.resetModules()
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test/api")
  return (await import("./api")).getBooks
}

describe("getBooks (Part B: book list counts against the user's own limit)", () => {
  beforeEach(() => vi.useRealTimers())
  afterEach(() => vi.unstubAllEnvs())

  it("logged out: public request, no Authorization header", async () => {
    installStorage()
    installFetch(() => true)
    const getBooks = await loadGetBooks()
    await getBooks({ featured: true })
    expect(bookCalls).toEqual([null])
  })

  it("logged in: sends the login token", async () => {
    const token = jwt(3600, "live")
    installStorage({ access_token: token, refresh_token: "r" })
    installFetch((auth) => auth === `Bearer ${token}`)
    const getBooks = await loadGetBooks()
    const page = await getBooks({ category: "fiction" })
    expect(bookCalls).toEqual([`Bearer ${token}`])
    expect(page).toEqual({ results: [{ id: 1, title: "A" }] })
  })

  it("dead session: falls back to the public request instead of failing", async () => {
    installStorage({ access_token: jwt(3600, "revoked"), refresh_token: "r" })
    // Any token is rejected and the refresh fails: only anonymous works.
    installFetch((auth) => auth === null, false)
    const getBooks = await loadGetBooks()
    const page = await getBooks()
    expect(bookCalls.at(-1)).toBeNull()
    expect(page).toEqual({ results: [{ id: 1, title: "A" }] })
  })
})
