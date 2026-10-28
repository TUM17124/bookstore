// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
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
    localStorage.clear()
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

  it("hydrates the static markup even with a remembered browser shape", async () => {
    const { Banners } = await import("./banners")
    const element = <Banners placement="home" emptyFallback={<p>No campaigns</p>} />
    const html = renderToString(element)
    localStorage.setItem("plugyard_banner_shape_v2:home:-", JSON.stringify({ m: "1 / 1", d: "4 / 1" }))
    api.getBanners.mockResolvedValue({ banners: [] })
    host = document.createElement("div")
    host.innerHTML = html
    document.body.append(host)
    const onRecoverableError = vi.fn()
    await act(async () => { root = hydrateRoot(host!, element, { onRecoverableError }) })
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(host.textContent).toContain("No campaigns")
    expect(api.peekBanners).not.toHaveBeenCalled()
  })

  it("reselects on category navigation and ignores a late response from the previous category", async () => {
    const { Banners } = await import("./banners")
    let finish!: (page: { banners: [] }) => void
    api.getBanners.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
      .mockResolvedValueOnce({ banners: [] })
    await render(<Banners category="fiction" emptyFallback={<p>Fiction empty</p>} />)
    await act(async () => { root!.render(<Banners category="cars" emptyFallback={<p>Cars empty</p>} />) })
    expect(api.getBanners).toHaveBeenLastCalledWith("category", "cars")
    await act(async () => { finish({ banners: [] }) })
    expect(host!.textContent).toBe("Cars empty")
  })

  it("refetches after account changes and later visits instead of retaining a personalized answer", async () => {
    const { Banners } = await import("./banners")
    api.getBanners.mockResolvedValue({ banners: [] })
    await render(<Banners placement="home" />)
    expect(api.getBanners).toHaveBeenCalledTimes(1)
    await act(async () => { window.dispatchEvent(new Event("auth-changed")) })
    expect(api.getBanners).toHaveBeenCalledTimes(2)
    await act(async () => { root!.render(null) })
    await act(async () => { root!.render(<Banners placement="home" />) })
    expect(api.getBanners).toHaveBeenCalledTimes(3)
  })
})
