// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAsyncAction, type ActionContext } from "@/hooks/use-async-action"
import { AuthFetchError } from "@/lib/auth-fetch"
import { ActionButton } from "./action-button"

// Part A: the shared button/hook every request-triggering button uses.

let root: Root | null = null
let el: HTMLDivElement | null = null

async function render(ui: React.ReactElement) {
  el = document.createElement("div")
  document.body.append(el)
  root = createRoot(el)
  await act(async () => root!.render(ui))
}

beforeEach(() => {
  // React act() environment flag for jsdom.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  act(() => root?.unmount())
  el?.remove()
  root = null
  vi.useRealTimers()
})

const btn = () => document.querySelector("button") as HTMLButtonElement
const visibleText = () =>
  [...btn().querySelectorAll('[aria-hidden="false"]')].map((n) => n.textContent).join("")
const flush = () => act(async () => {})

type Fn = (ctx: ActionContext, arg: string) => Promise<string>

function Harness({ fn, arg = "a", successMs = 1500 }: { fn: Fn; arg?: string; successMs?: number }) {
  const action = useAsyncAction(fn, { successMs })
  return (
    <ActionButton action={action} onClick={() => action.run(arg)} loadingLabel="Saving…" successLabel="Saved">
      Save
    </ActionButton>
  )
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("ActionButton + useAsyncAction", () => {
  it("idle → loading (busy, still focusable) → success → idle", async () => {
    vi.useFakeTimers()
    const d = deferred<string>()
    const fn = vi.fn(() => d.promise)
    await render(<Harness fn={fn} />)
    expect(visibleText()).toBe("Save")

    btn().focus()
    await act(async () => btn().click())
    expect(visibleText()).toBe("Saving…")
    expect(btn().getAttribute("aria-busy")).toBe("true")
    expect(btn().getAttribute("aria-disabled")).toBe("true")
    expect(btn().disabled).toBe(false) // not `disabled`: keyboard focus stays
    expect(document.activeElement).toBe(btn())
    expect(document.querySelector('[role="status"]')?.textContent).toBe("Saving…")

    await act(async () => d.resolve("ok"))
    expect(visibleText()).toBe("Saved")
    expect(btn().hasAttribute("aria-busy")).toBe(false)

    await act(async () => vi.advanceTimersByTime(1600))
    expect(visibleText()).toBe("Save")
  })

  it("double-click sends ONE request", async () => {
    const d = deferred<string>()
    const fn = vi.fn(() => d.promise)
    await render(<Harness fn={fn} />)
    await act(async () => {
      btn().click()
      btn().click()
      btn().click()
    })
    expect(fn).toHaveBeenCalledTimes(1)
    await act(async () => d.resolve("ok"))
  })

  it("error: message announced, button becomes 'Try again', which reuses the idempotency key", async () => {
    const keys: string[] = []
    const fn = vi.fn(async (ctx: ActionContext) => {
      keys.push(ctx.idempotencyKey)
      if (keys.length === 1) throw new AuthFetchError("Couldn't reach PlugYard.", 0, "network")
      return "ok"
    })
    await render(<Harness fn={fn} />)
    await act(async () => btn().click())
    await flush()
    const alert = document.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe("Couldn't reach PlugYard.")
    expect(visibleText()).toBe("Try again")

    await act(async () => btn().click())
    await flush()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(keys[1]).toBe(keys[0]) // same action → same key → server replays, no duplicate
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it("a different action (new arguments) or one after success gets a NEW key", async () => {
    const keys: string[] = []
    let fail = true
    const fn = vi.fn(async (ctx: ActionContext) => {
      keys.push(ctx.idempotencyKey)
      if (fail) throw new AuthFetchError("x", 503)
      return "ok"
    })
    await render(<Harness fn={fn} arg="first" />)
    await act(async () => btn().click()) // fails
    await act(async () => root!.render(<Harness fn={fn} arg="second" />))
    await act(async () => btn().click()) // different args → new key
    fail = false
    await act(async () => btn().click()) // same args as previous failure → same key, succeeds
    await flush()
    await act(async () => btn().click()) // after success → new key
    expect(keys[1]).not.toBe(keys[0])
    expect(keys[2]).toBe(keys[1])
    expect(keys[3]).not.toBe(keys[2])
  })

  it("shows the retry countdown while the request is retrying", async () => {
    vi.useFakeTimers()
    const d = deferred<string>()
    const fn = vi.fn((ctx: ActionContext) => {
      ctx.onRetry({ attempt: 3, maxRetries: 3, delayMs: 3000, reason: "network" })
      return d.promise
    })
    await render(<Harness fn={fn} />)
    await act(async () => btn().click())
    // The button keeps a short label (stable width); the countdown is the
    // status line right after it.
    expect(visibleText()).toBe("Retrying…")
    const status = () => document.querySelector('[role="status"]')?.textContent
    expect(status()).toBe("Connection problem, retrying in 3 s…")
    expect(btn().getAttribute("aria-busy")).toBe("true")
    await act(async () => vi.advanceTimersByTime(1100))
    expect(status()).toBe("Connection problem, retrying in 2 s…")
    await act(async () => d.resolve("ok"))
  })

  it("keeps a stable width: every label variant is rendered in the same cell", async () => {
    await render(<Harness fn={async () => "ok"} />)
    const variants = [...btn().querySelectorAll("span > span")].map((n) => n.textContent)
    expect(variants).toEqual(expect.arrayContaining(["Save", "Saving…", "Saved", "Try again"]))
    expect(variants.some((t) => t?.startsWith("Retrying"))).toBe(true)
  })

  it("unmounting (leaving the page) aborts the request; that's not shown as an error", async () => {
    let signal: AbortSignal | null = null
    const fn = vi.fn((ctx: ActionContext) => {
      signal = ctx.signal
      return new Promise<string>((_, reject) =>
        ctx.signal.addEventListener("abort", () => reject(new AuthFetchError("Cancelled.", 0, "aborted"))),
      )
    })
    await render(<Harness fn={fn} />)
    await act(async () => btn().click())
    act(() => root!.unmount())
    root = null
    expect(signal!.aborted).toBe(true)
  })

  it("pagehide cancels too", async () => {
    let signal: AbortSignal | null = null
    const fn = vi.fn((ctx: ActionContext) => {
      signal = ctx.signal
      return new Promise<string>(() => {})
    })
    await render(<Harness fn={fn} />)
    await act(async () => btn().click())
    await act(async () => window.dispatchEvent(new Event("pagehide")))
    expect(signal!.aborted).toBe(true)
  })

  it("a caller-disabled button does nothing", async () => {
    const fn = vi.fn(async () => "ok")
    function Disabled() {
      const a = useAsyncAction(fn)
      return (
        <ActionButton action={a} onClick={() => a.run()} disabled>
          Go
        </ActionButton>
      )
    }
    await render(<Disabled />)
    await act(async () => btn().click())
    expect(fn).not.toHaveBeenCalled()
  })
})
