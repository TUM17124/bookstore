import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  ensureFreshAuthToken,
  getAuthToken,
  invalidateAuthToken,
} from "./auth-token"

// The refresh endpoint is module-level state in src/lib/api.ts, so it has to be
// mocked rather than pointed at a real server. NB: relative specifier - vitest
// has no `@/` alias configured, so the mock key must match the resolved path.
const refreshMock = vi.fn()
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api")
  return {
    ...actual,
    refreshAccessToken: (...args: unknown[]) => refreshMock(...args),
  }
})

/** Minimal localStorage stand-in (no jsdom environment in this project). */
function installStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  // src/lib/api.ts guards on `typeof window === "undefined"` in both getToken
  // and invalidateAuthToken, so a bare localStorage global is not enough here.
  // @ts-expect-error - installing the test global
  globalThis.localStorage = localStorage
  // @ts-expect-error - installing the test global
  globalThis.window = { localStorage }
  return store
}

describe("editor auth token", () => {
  beforeEach(() => {
    refreshMock.mockReset()
  })

  it("keeps the refresh token when invalidating a stale access token", () => {
    // THE regression: invalidateAuthToken used to call clearTokens(), which
    // dropped refresh_token as well. Because the access token is short-lived
    // (1h), a single expired-token 401 then logged the user out permanently
    // and made "cannot open a document / cannot upload" unrecoverable.
    const store = installStorage({
      access_token: "stale",
      access: "stale",
      token: "stale",
      refresh_token: "keep-me",
    })

    invalidateAuthToken()

    expect(store.get("access_token")).toBeUndefined()
    expect(store.get("access")).toBeUndefined()
    expect(store.get("token")).toBeUndefined()
    expect(store.get("refresh_token")).toBe("keep-me")
  })

  it("leaves storage untouched when there is no refresh token to redeem", () => {
    // Nothing to recover, so there is no reason to mutate storage. (Covers the
    // logged-out case: a 401 should not be able to wipe an unrelated session.)
    const store = installStorage({ access_token: "stale" })

    invalidateAuthToken()

    expect(store.get("access_token")).toBe("stale")
  })

  it("returns the stored token as-is when one is present", async () => {
    installStorage({ access_token: "good", refresh_token: "r" })
    await expect(ensureFreshAuthToken()).resolves.toBe("good")
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it("refreshes and persists a new access token when the old one expired", async () => {
    // This is the path that makes an expired session self-heal instead of
    // dead-ending on a 401 with no way forward.
    const store = installStorage({ refresh_token: "r" })
    refreshMock.mockImplementation(() => {
      store.set("access_token", "fresh")
      store.set("access", "fresh")
      return Promise.resolve("fresh")
    })

    await expect(ensureFreshAuthToken()).resolves.toBe("fresh")
    expect(refreshMock).toHaveBeenCalledTimes(1)
    await expect(getAuthToken()).resolves.toBe("fresh")
  })

  it("resolves null instead of throwing when the session is really over", async () => {
    // Callers send the request unauthenticated and surface the real 401; a
    // thrown refresh error here would mask the actual server response.
    installStorage({ refresh_token: "revoked" })
    refreshMock.mockRejectedValue(new Error("Session expired"))

    await expect(ensureFreshAuthToken()).resolves.toBeNull()
  })

  it("does not attempt a refresh with no stored session at all", async () => {
    installStorage({})
    await expect(ensureFreshAuthToken()).resolves.toBeNull()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
