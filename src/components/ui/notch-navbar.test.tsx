// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NotchNavbar } from "./notch-navbar"

const auth = vi.hoisted(() => ({
  getStoredUser: vi.fn(() => null),
  isLoggedIn: vi.fn(() => false),
  refreshBookmarks: vi.fn(),
}))

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href as string} {...props}>{children}</a> }))
vi.mock("@/components/bookmarks-context", () => ({ useBookmarks: () => ({ bookmarks: [], refreshBookmarks: auth.refreshBookmarks }) }))
vi.mock("@/components/book-search-modal", () => ({ BookSearchModal: () => null }))
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/components/notification-bell", () => ({ NotificationBell: () => null }))
vi.mock("@/components/brand-logo", () => ({ BrandLogo: () => <span /> }))
vi.mock("@/components/category-nav/category-sheet", () => ({ CategorySheet: () => null, openCategorySheet: vi.fn() }))
vi.mock("@/lib/auth-client", () => ({
  getStoredUser: auth.getStoredUser,
  isLoggedIn: auth.isLoggedIn,
  listenForUserChanges: vi.fn(),
  refreshMe: vi.fn(async () => null),
  clientLogout: vi.fn(),
}))
vi.mock("@/lib/referral", () => ({ getReferralCode: () => "" }))
vi.mock("@/lib/api", () => ({
  getProStatus: vi.fn(async () => ({ is_pro: false })),
  getToken: () => "",
  refreshAccessToken: vi.fn(),
  SessionEvictedError: class SessionEvictedError extends Error {},
  tokenExpiresInMs: () => null,
}))

describe("PlugYard primary navigation", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<NotchNavbar />))
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
  })

  it("keeps Wishlist on the heart shortcut without a duplicate mobile drawer entry", async () => {
    const toggle = host.querySelector<HTMLButtonElement>('button[aria-label="Toggle menu"]')!
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    await act(async () => { toggle.click(); await Promise.resolve() })
    expect(toggle.getAttribute("aria-expanded")).toBe("true")

    const drawer = host.querySelector<HTMLElement>("#plugyard-mobile-navigation")!
    expect(drawer.querySelector('a[href="/wishlist"]')).toBeNull()
    expect(host.querySelectorAll('a[aria-label^="Wishlist"]')).toHaveLength(2) // desktop and mobile heart shortcuts
  })
})
