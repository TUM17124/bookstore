import { afterEach, describe, expect, it, vi } from "vitest"

import { peekPreloaded, preloadScript, takePreloaded } from "./preload"
import { bannersPath } from "./visitor"

/** A JWT-shaped token whose payload carries `exp` (signature irrelevant). */
function jwt(expiresInSec: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return `${b64({ alg: "HS256" })}.${b64({ exp: Math.floor(Date.now() / 1000) + expiresInSec })}.sig`
}

type Calls = { url: string; auth: string | undefined; vid?: string }[]

/** Runs the inline script against a fake page; returns the fetches it made. */
function runScript(href: string, token: string | null, body: unknown = { sections: [] }, ok = true): Calls {
  const calls: Calls = []
  const url = new URL(href)
  const win: Record<string, unknown> = {}
  vi.stubGlobal("window", win)
  vi.stubGlobal("location", { pathname: url.pathname, search: url.search })
  const store: Record<string, string> = token ? { access_token: token } : {}
  vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) })
  vi.stubGlobal("fetch", (u: string, init: { headers: Record<string, string> }) => {
    calls.push({ url: u, auth: init.headers.Authorization, vid: init.headers["X-Visitor-Id"] })
    return Promise.resolve({ ok, json: () => Promise.resolve(body) })
  })
  new Function(preloadScript("https://api.test/api"))()
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe("preload inline script", () => {
  it("starts sections + banners on the home page, with the login", async () => {
    const t = jwt(600)
    const calls = runScript("https://x.test/", t)
    expect(calls.map(({ url, auth }) => ({ url, auth }))).toEqual([
      { url: "https://api.test/api/home/sections/", auth: `Bearer ${t}` },
      // banners are personal: same login, plus a random browser id for caps
      { url: "https://api.test/api" + bannersPath("home"), auth: `Bearer ${t}` },
    ])
    expect(calls[1].vid).toMatch(/^[A-Za-z0-9-]{16,64}$/)
    expect(await takePreloaded("/home/sections/", t)).toEqual({ sections: [] })
  })

  it("passes the category the same way the app does", () => {
    const calls = runScript("https://x.test/?category=%20self%20help%20", null)
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.test/api/home/sections/?category=self%20help",
      "https://api.test/api" + bannersPath("category", "self help"),
    ])
  })

  it("dashboard: only its banners; an opened book: its banners too", () => {
    expect(runScript("https://x.test/dashboard/", null).map((c) => c.url)).toEqual([
      "https://api.test/api" + bannersPath("dashboard"),
    ])
    expect(runScript("https://x.test/?book=5", null).map((c) => c.url)).toEqual([
      "https://api.test/api/home/sections/",
      "https://api.test/api" + bannersPath("home"),
      "https://api.test/api" + bannersPath("book"),
    ])
  })

  it("does nothing on other pages or searches", () => {
    expect(runScript("https://x.test/bookmarks/", null)).toEqual([])
    expect(runScript("https://x.test/?q=love", null)).toEqual([])
  })

  it("leaves an expired login to the app (no sections preload)", () => {
    const calls = runScript("https://x.test/", jwt(-60))
    expect(calls.map((c) => [c.url, c.auth])).toEqual([["https://api.test/api" + bannersPath("home"), undefined]])
  })
})

describe("peekPreloaded", () => {
  it("gives the answer synchronously once it has arrived, once", async () => {
    runScript("https://x.test/", null, { banners: [{ id: 1 }] })
    const path = bannersPath("home")
    await takePreloaded("/home/sections/", null) // let the fake fetches settle
    expect(peekPreloaded(path, null)).toEqual({ banners: [{ id: 1 }] })
    expect(peekPreloaded(path, null)).toBeUndefined()
  })
})

describe("takePreloaded", () => {
  it("is used once, only for the same login", async () => {
    const t = jwt(600)
    runScript("https://x.test/", t)
    expect(await takePreloaded("/home/sections/", null)).toBeNull()
    expect(await takePreloaded("/home/sections/", t)).toEqual({ sections: [] })
    expect(await takePreloaded("/home/sections/", t)).toBeNull()
  })

  it("a cancelled caller leaves it for the next one", async () => {
    runScript("https://x.test/", null)
    const ctrl = new AbortController()
    const first = takePreloaded("/home/sections/", null, ctrl.signal)
    const second = takePreloaded("/home/sections/", null)
    ctrl.abort()
    expect(await first).toBeNull()
    expect(await second).toEqual({ sections: [] })
  })

  it("a failed preload gives null (the app fetches normally)", async () => {
    runScript("https://x.test/", null, {}, false)
    expect(await takePreloaded("/home/sections/", null)).toBeNull()
  })
})
