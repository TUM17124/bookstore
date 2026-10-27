// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  getBanners: vi.fn(),
  peekBanners: vi.fn(() => undefined),
  sendBannerEvent: vi.fn(),
}))

vi.mock("@/lib/api", () => api)
vi.mock("./countdown", () => ({ Countdown: () => null, noteServerTime: vi.fn() }))
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))

describe("Banners", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    api.getBanners.mockReset()
    api.peekBanners.mockReset().mockReturnValue(undefined)
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })

  async function render(element: React.ReactNode) {
    const { Banners } = await import("./banners")
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(element)
      await Promise.resolve()
      await Promise.resolve()
    })
    return host
  }

  it("renders banners returned after the initial render", async () => {
    api.getBanners.mockResolvedValue({
      banners: [{
        id: 17,
        title: "Admin campaign",
        subtitle: "",
        button_text: "",
        button_link: "",
        image_desktop: { url: "", width: null, height: null },
        image_mobile: { url: "", width: null, height: null },
        image_alt: "",
        text_color: "#fff",
        button_color: "#000",
        button_text_color: "#fff",
        overlay: "none",
        overlay_strength: 0,
        countdown: null,
      }],
      settings: { carousel: true, autoplay_seconds: 0 },
    })

    const { Banners } = await import("./banners")
    const view = await render(<Banners placement="home" emptyFallback={<p>No campaigns</p>} />)
    expect(view.querySelector('[data-banner-id="17"] h2')?.textContent).toBe("Admin campaign")
    expect(view.textContent).not.toContain("No campaigns")
  })

  it("shows the fallback only after the request confirms there are no active banners", async () => {
    api.getBanners.mockResolvedValue({ banners: [], settings: { carousel: true, autoplay_seconds: 0 } })

    const { Banners } = await import("./banners")
    const view = await render(<Banners placement="dashboard" emptyFallback={<p>Existing site text</p>} />)
    expect(view.textContent).toContain("Existing site text")
    expect(view.querySelector("[data-banner-id]")).toBeNull()
  })
})
