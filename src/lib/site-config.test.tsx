// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Part D: admin-editable texts / switches with built-in fallbacks.

let root: Root | null = null
let el: HTMLDivElement | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  vi.resetModules()
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test/api")
})
afterEach(() => {
  act(() => root?.unmount())
  el?.remove()
  root = null
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function render(ui: React.ReactElement) {
  el = document.createElement("div")
  document.body.append(el)
  root = createRoot(el)
  await act(async () => root!.render(ui))
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function config(over: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({
      currency: { code: "KES", symbol: "KES", position: "before", space: true, decimals: 0, thousands: "," },
      server_now: "2026-10-03T10:00:00Z",
      ...over,
    }),
  }
}

describe("site config", () => {
  it("uses the built-in texts when the server can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    const { useText, useList, useFeature, useLimits } = await import("./site-config")
    function Probe() {
      const limits = useLimits()
      return (
        <p>
          {useText("pro.headline")}|{useList("marquee.items").length}|{String(useFeature("reviews"))}|
          {limits.payout_every_days}|{limits.editor_upload_max_mb}
        </p>
      )
    }
    await render(<Probe />)
    expect(el!.textContent).toBe("Read and listen without limits|38|true|30|80")
  })

  it("shows the admin's texts and switches once loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        config({
          texts: { "pro.headline": "Unlimited reading", "marquee.items": ["One", "Two"], "push.button": "" },
          features: { reviews: false },
          limits: { default_preview_pages: 6, payout_every_days: 14, editor_trash_days: 30, editor_upload_max_mb: 80 },
        }),
      ),
    )
    const { useText, useList, useFeature, useLimits } = await import("./site-config")
    function Probe() {
      return (
        <p>
          {useText("pro.headline")}|{useList("marquee.items").join(",")}|{useText("push.button")}|
          {String(useFeature("reviews"))}|{String(useFeature("boosts"))}|{useLimits().payout_every_days}
        </p>
      )
    }
    await render(<Probe />)
    // An empty admin text falls back to the built-in one.
    expect(el!.textContent).toBe("Unlimited reading|One,Two|Allow personal alerts|false|true|14")
  })

  it("fills variables and leaves unknown ones as typed", async () => {
    const { fill } = await import("./site-config")
    expect(fill("© {year} PlugYard", { year: 2026 })).toBe("© 2026 PlugYard")
    expect(fill("{name}, hi {other}", { name: "Amina" })).toBe("Amina, hi {other}")
  })

  it("recognises a switched-off refusal from the server", async () => {
    const { isFeatureOff } = await import("./site-config")
    expect(isFeatureOff({ code: "feature_off", error: "x", feature: "boosts" })).toBe(true)
    expect(isFeatureOff({ code: "price_changed" })).toBe(false)
  })
})
