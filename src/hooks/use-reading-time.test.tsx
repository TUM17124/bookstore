// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ queueSignal: vi.fn() }))
import { queueSignal } from "@/lib/api"
import { useReadingTime } from "./use-reading-time"

// React 19 act() outside a test renderer
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
function Reader({ active, mode }: { active: boolean; mode: "reader" | "audio" }) {
  useReadingTime("42", active, mode)
  return null
}
function mount(active: boolean, mode: "reader" | "audio") {
  const el = document.createElement("div")
  document.body.appendChild(el)
  root = createRoot(el)
  act(() => root.render(<Reader active={active} mode={mode} />))
}
const sent = () => vi.mocked(queueSignal).mock.calls.map((c) => c[0])

describe("useReadingTime (Part E: reading time signals)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(queueSignal).mockClear()
  })
  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it("reader: counts active reading, sends once a minute and on close", () => {
    mount(true, "reader")
    for (let i = 0; i < 12; i++) {
      window.dispatchEvent(new Event("scroll"))
      act(() => vi.advanceTimersByTime(5_000))
    }
    expect(sent()).toEqual([{ kind: "read_time", book_id: "42", placement: "reader", value: 60 }])
    act(() => vi.advanceTimersByTime(10_000))
    act(() => root.render(<Reader active={false} mode="reader" />)) // closed
    expect(sent()[1]).toEqual({ kind: "read_time", book_id: "42", placement: "reader", value: 10 })
  })

  it("reader: an idle open tab stops counting after two minutes", () => {
    mount(true, "reader")
    act(() => vi.advanceTimersByTime(10 * 60_000)) // no scroll/tap/key at all
    const total = sent().reduce((a, e) => a + (e.value ?? 0), 0)
    expect(total).toBeLessThanOrEqual(120)
  })

  it("audio: counts only while playing", () => {
    mount(false, "audio")
    act(() => vi.advanceTimersByTime(60_000))
    expect(sent()).toEqual([])
    act(() => root.render(<Reader active mode="audio" />))
    act(() => vi.advanceTimersByTime(60_000))
    expect(sent()).toEqual([{ kind: "read_time", book_id: "42", placement: "audio", value: 60 }])
  })
})

describe("queueSignal (batched, keepalive)", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it("sends one batch after 5 seconds with the browser id", async () => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.doUnmock("@/lib/api")
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test/api")
    const calls: { url: string; body: { events: unknown[] }; init: RequestInit }[] = []
    globalThis.fetch = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(u), body: JSON.parse(String(init?.body)), init: init as RequestInit })
      return new Response("{}")
    }) as unknown as typeof fetch
    const api = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
    api.queueSignal({ kind: "impression", book_id: 1, placement: "home", section_id: 3, position: 2 })
    api.queueSignal({ kind: "click", book_id: 1, placement: "home", section_id: 3, position: 2 })
    expect(calls).toEqual([])
    vi.advanceTimersByTime(5_000)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("http://api.test/api/signals/")
    expect(calls[0].body.events).toHaveLength(2)
    expect(calls[0].init.keepalive).toBe(true)
    expect(new Headers(calls[0].init.headers).get("X-Visitor-Id")).toMatch(/^[A-Za-z0-9-]{16,64}$/)
  })
})
