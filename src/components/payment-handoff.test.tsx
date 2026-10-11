// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HANDOFF_DELAY_MS, HANDOFF_SLOW_MS, usePaymentHandoff } from "./payment-handoff"
import { PaymentResultCard } from "./payment-result"
import { safePaymentUrl } from "@/lib/payment-handoff"

let root: Root | null = null
let el: HTMLDivElement | null = null
const assign = vi.fn()

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  assign.mockReset()
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { origin: "https://plugyard.com", set href(v: string) { assign(v) } },
  })
})
afterEach(() => {
  act(() => root?.unmount())
  el?.remove()
  root = null
  vi.useRealTimers()
})

let api: ReturnType<typeof usePaymentHandoff>
function Harness() {
  api = usePaymentHandoff()
  return <div>{api.node}</div>
}
async function mount(ui: React.ReactElement) {
  el = document.createElement("div")
  document.body.append(el)
  root = createRoot(el)
  await act(async () => root!.render(ui))
}

describe("safePaymentUrl", () => {
  it("allows https and our own pages, refuses the rest", () => {
    const o = "https://plugyard.com"
    expect(safePaymentUrl("https://checkout.paystack.com/abc", o)).toContain("paystack.com")
    expect(safePaymentUrl("/checkout/success?order=1", o)).toBe("https://plugyard.com/checkout/success?order=1")
    expect(safePaymentUrl("javascript:alert(1)", o)).toBeNull()
    expect(safePaymentUrl("http://evil.example/x", o)).toBeNull()
  })
})

describe("payment hand-off screen", () => {
  it("shows what is being paid, then leaves for the payment page", async () => {
    await mount(<Harness />)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => {
      api.start("https://checkout.paystack.com/abc", { what: "My Book", amount: "KES 250" })
    })
    const text = document.querySelector('[role="dialog"]')!.textContent!
    expect(text).toContain("My Book")
    expect(text).toContain("KES 250")
    expect(text).toContain("checkout.paystack.com")
    expect(assign).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(HANDOFF_DELAY_MS + 10))
    expect(assign).toHaveBeenCalledWith("https://checkout.paystack.com/abc")
  })

  it("offers a manual link when the redirect is slow, and Cancel closes it", async () => {
    await mount(<Harness />)
    await act(async () => {
      api.start("https://checkout.paystack.com/abc", { what: "Pro" })
    })
    expect(document.querySelector('[data-testid="handoff-slow"]')).toBeNull()
    await act(async () => vi.advanceTimersByTime(HANDOFF_SLOW_MS + 10))
    expect(document.querySelector('[data-testid="handoff-slow"] a')!.getAttribute("href")).toContain("paystack")
    await act(async () => {
      ;(document.querySelector("button") as HTMLButtonElement).click()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it("refuses an unsafe address", async () => {
    await mount(<Harness />)
    let ok = true
    await act(async () => {
      ok = api.start("javascript:alert(1)", { what: "x" })
    })
    expect(ok).toBe(false)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it("result card uses alert for failures and status otherwise", async () => {
    await mount(<PaymentResultCard kind="failed" title="No" />)
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
  })
})
