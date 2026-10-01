// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { _resetRefreshStateForTests } from "./api"
import { broadcastAccountChange, getStoredUser, listenForUserChanges, refreshMe, setStoredUser } from "./auth-client"

// Part A: profile changes show everywhere immediately (no logout/login).

function jwt(expiresInSec: number) {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return `${b64({ alg: "HS256" })}.${b64({ exp: Math.floor(Date.now() / 1000) + expiresInSec, user_id: 2 })}.sig`
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const flush = () => new Promise((r) => setTimeout(r, 20))

beforeEach(() => {
  _resetRefreshStateForTests()
  localStorage.clear()
  localStorage.setItem("access_token", jwt(3600))
  localStorage.setItem("refresh_token", "r")
})
afterEach(() => vi.restoreAllMocks())

describe("user store", () => {
  it("loads the profile from /api/me/ (the server), not the login-time copy", async () => {
    setStoredUser({ email: "old@example.test", name: "Old" }) // written at login
    globalThis.fetch = vi.fn(async () =>
      json(200, { id: 2, email: "new@example.test", name: "New Name", username: "fresh", pending_email: "" }),
    ) as unknown as typeof fetch
    const me = await refreshMe()
    expect(me?.name).toBe("New Name")
    expect(getStoredUser()).toMatchObject({ email: "new@example.test", name: "New Name", username: "fresh" })
    const [url] = (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0]
    expect(String(url)).toMatch(/\/me\/$/)
  })

  it("a save publishes the server's user to every listener in this tab at once", async () => {
    const seen: (string | undefined)[] = []
    const onChange = () => seen.push(getStoredUser()?.name)
    window.addEventListener("auth-changed", onChange)
    setStoredUser({ id: 2, email: "a@example.test", name: "Renamed" })
    window.removeEventListener("auth-changed", onChange)
    expect(seen).toEqual(["Renamed"])
  })

  it("other tabs are told (BroadcastChannel) and re-render with the new value", async () => {
    listenForUserChanges()
    // Another tab = another channel instance on the same name.
    const otherTab = new BroadcastChannel("plugyard-user")
    const messages: unknown[] = []
    otherTab.onmessage = (e) => messages.push(e.data)
    setStoredUser({ id: 2, email: "a@example.test", name: "Changed Elsewhere" })
    broadcastAccountChange()
    await flush()
    otherTab.close()
    expect(messages).toEqual([{ type: "user-changed" }, { type: "account-changed" }])
  })

  it("a message from another tab makes this tab re-read the user", async () => {
    listenForUserChanges()
    let rerenders = 0
    const onChange = () => (rerenders += 1)
    window.addEventListener("auth-changed", onChange)
    const otherTab = new BroadcastChannel("plugyard-user")
    otherTab.postMessage({ type: "user-changed" })
    await flush()
    otherTab.close()
    window.removeEventListener("auth-changed", onChange)
    expect(rerenders).toBe(1)
  })

  it("keeps the cached copy when /api/me/ is unreachable (no blank navbar)", async () => {
    setStoredUser({ id: 2, email: "a@example.test", name: "Cached" })
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    }) as unknown as typeof fetch
    vi.useFakeTimers()
    const p = refreshMe()
    await vi.runAllTimersAsync()
    expect(await p).toBeNull()
    vi.useRealTimers()
    expect(getStoredUser()?.name).toBe("Cached")
  })

  it("signed out: no request, nothing published", async () => {
    localStorage.removeItem("access_token")
    globalThis.fetch = vi.fn() as unknown as typeof fetch
    expect(await refreshMe()).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
