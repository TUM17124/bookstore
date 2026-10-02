import { afterEach, describe, expect, it, vi } from "vitest"

import { clearPending, localTheme, readPending, setPending, themeInitScript, tokenUserId } from "./theme"

function storage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  return store
}

/** Runs the head script on a fake <html>; returns its classes. */
function runInit(saved: string | null, deviceDark: boolean): string[] {
  const classes = new Set<string>(["light"])
  storage(saved == null ? {} : { theme: saved })
  vi.stubGlobal("document", {
    documentElement: {
      classList: {
        add: (c: string) => void classes.add(c),
        remove: (...cs: string[]) => cs.forEach((c) => classes.delete(c)),
      },
    },
  })
  const mm = () => ({ matches: deviceDark })
  vi.stubGlobal("window", { matchMedia: mm })
  vi.stubGlobal("matchMedia", mm)
  new Function(themeInitScript())()
  return [...classes]
}

afterEach(() => vi.unstubAllGlobals())

describe("head script (no flash)", () => {
  it("uses the saved choice over the device", () => {
    expect(runInit("dark", false)).toEqual(["dark"])
    expect(runInit("light", true)).toEqual(["light"])
  })
  it("follows the device before any choice", () => {
    expect(runInit(null, true)).toEqual(["dark"])
    expect(runInit(null, false)).toEqual(["light"])
    expect(runInit("system", true)).toEqual(["dark"])
  })
})

describe("pending account save", () => {
  it("is kept per user and cleared only for the theme that was saved", () => {
    storage()
    setPending("dark", 7)
    expect(readPending()).toEqual({ theme: "dark", uid: 7 })
    clearPending("light") // an older save finishing: keep the newer choice
    expect(readPending()).toEqual({ theme: "dark", uid: 7 })
    clearPending("dark")
    expect(readPending()).toBeNull()
  })
  it("ignores junk", () => {
    storage({ plugyard_theme_pending_v1: '{"theme":"blue","uid":1}' })
    expect(readPending()).toBeNull()
    storage({ plugyard_theme_pending_v1: "not json" })
    expect(readPending()).toBeNull()
  })
})

describe("helpers", () => {
  it("reads the local choice", () => {
    storage({ theme: "dark" })
    expect(localTheme()).toBe("dark")
    storage({ theme: "system" })
    expect(localTheme()).toBeNull()
  })
  it("reads user_id from the access token", () => {
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "")
    expect(tokenUserId(`${b64({ alg: "HS256" })}.${b64({ user_id: 42 })}.sig`)).toBe(42)
    expect(tokenUserId("nonsense")).toBeNull()
    expect(tokenUserId(null)).toBeNull()
  })
})
