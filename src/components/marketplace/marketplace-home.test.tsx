// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const banners = vi.hoisted(() => ({ preload: vi.fn() }))
vi.mock("@/components/offers/banners", () => ({
  Banners: ({ placement, className, emptyFallback }: { placement: string; className: string; emptyFallback: React.ReactNode }) =>
    <div data-testid="home-banners" data-placement={placement} className={className}>{emptyFallback}</div>,
  useBannerData: banners.preload,
}))
vi.mock("@/lib/categories", () => ({
  useCategories: () => ({ all: [] }),
  categoryHref: () => "/marketplace/",
  CategoryIcon: () => null,
}))
vi.mock("@/lib/site-config", () => ({
  usePairs: () => [],
  useText: (key: string) => key === "marketplace.hero_title" ? "Admin site title" : "Admin site description",
}))
vi.mock("@/lib/marketplace", () => ({ marketListings: vi.fn() }))
vi.mock("./listing-card", () => ({ ListingCard: () => null }))
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))

describe("MarketplaceHome admin banner placement", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    banners.preload.mockClear()
  })
  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })

  it("renders the admin-managed home banner and keeps only a compact site-text fallback", async () => {
    const { MarketplaceHome } = await import("./marketplace-home")
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(<MarketplaceHome />))

    const banner = host.querySelector('[data-testid="home-banners"]')
    expect(banner?.getAttribute("data-placement")).toBe("home")
    expect(banners.preload).toHaveBeenCalledOnce()
    expect(host.querySelector("h1")?.textContent).toBe("Admin site title")
    expect(host.querySelector("input[name=search]")).toBeNull()
    expect(host.textContent).toContain("Admin site description")
  })
})
