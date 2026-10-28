// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import SellerListings from "./page-client"

const api = vi.hoisted(() => ({
  archive: vi.fn(), confirm: vi.fn(), remove: vi.fn(), categories: vi.fn(), listings: vi.fn(),
  replaceMedia: vi.fn(), restore: vi.fn(), update: vi.fn(),
}))

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href as string} {...props}>{children}</a> }))
vi.mock("@/lib/marketplace", () => ({
  archiveMyListing: api.archive,
  confirmSellerAvailability: api.confirm,
  deleteMyListing: api.remove,
  listingPrice: (listing: { price_amount: string }) => `KES ${listing.price_amount}`,
  marketCategories: api.categories,
  myListings: api.listings,
  replaceListingMedia: api.replaceMedia,
  restoreMyListing: api.restore,
  updateMyListing: api.update,
}))

const listing = (id: number, title: string, fulfillment_type: string, extra: Record<string, unknown> = {}) => ({
  id, seller: { id: 2, name: "Seller" }, category: "removed-category", title, slug: `listing-${id}`,
  description_text: "Description", price_type: "fixed" as const, price_amount: "100.00", price_min: null,
  price_max: null, currency: "KES", fulfillment_type, status: "active", moderation_status: "approved",
  published_at: null, media: [], viewer: { mode: "gallery" as const, config: {} }, url: `/listing-${id}`,
  legacy_book_id: null, inventory_summary: { policy: "none" as const, configured: true, in_stock: true, variants: [] },
  checkout_disabled: false, is_demo: false, inactive_paused_at: null, ...extra,
})

describe("seller listing access and actions", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  async function render(kind: "all" | "product" | "service" = "all") {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(<SellerListings embedded kind={kind} />))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    api.categories.mockResolvedValue([])
    api.listings.mockResolvedValue({ count: 3, results: [listing(1, "Physical item", "shipping"), listing(2, "Seller service", "service"), listing(3, "Published book", "shipping", { legacy_book_id: 55, viewer: { mode: "book_3d", config: {} } })], next: null, previous: null })
    api.archive.mockImplementation(async (id: number) => listing(id, "Physical item", "shipping", { status: "archived" }))
    api.restore.mockImplementation(async (id: number) => listing(id, "Physical item", "shipping", { status: "draft", moderation_status: "pending" }))
    api.update.mockImplementation(async (id: number, payload: { title: string }) => listing(id, payload.title, "shipping"))
    api.remove.mockResolvedValue(undefined)
    vi.stubGlobal("confirm", vi.fn(() => true))
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("keeps seller products and services visible when public category discovery has no category", async () => {
    await render("product")
    expect(host!.textContent).toContain("Physical item")
    expect(host!.textContent).not.toContain("Seller service")
    expect(host!.textContent).not.toContain("Published book")
    expect(host!.querySelector('[data-testid="seller-listing-count"]')?.textContent).toBe("1 product")

    act(() => root?.unmount())
    root = null
    host?.remove()
    host = null
    await render("service")
    expect(host!.textContent).toContain("Seller service")
    expect(host!.textContent).not.toContain("Physical item")
    expect(host!.querySelector('[data-testid="seller-listing-count"]')?.textContent).toBe("1 service")
  })

  it("calls the archive and restore endpoints and reflects their persisted statuses", async () => {
    await render("product")
    const archiveButton = [...host!.querySelectorAll("button")].find((button) => button.textContent === "Archive")
    expect(archiveButton).toBeTruthy()
    await act(async () => { archiveButton!.click(); await Promise.resolve() })
    expect(api.archive).toHaveBeenCalledWith(1)
    expect(host!.textContent).toContain("Listing archived.")
    expect(host!.textContent).toContain("archived")

    const restoreButton = [...host!.querySelectorAll("button")].find((button) => button.textContent === "Restore as draft")
    await act(async () => { restoreButton!.click(); await Promise.resolve() })
    expect(api.restore).toHaveBeenCalledWith(1)
    expect(host!.textContent).toContain("restored as a draft")
    expect(host!.textContent).toContain("draft")
  })

  it("calls DELETE and removes only the deleted listing from the visible dashboard", async () => {
    await render("product")
    await act(async () => { [...host!.querySelectorAll("button")].find((button) => button.textContent === "Delete")!.click(); await Promise.resolve() })
    expect(api.remove).toHaveBeenCalledWith(1)
    expect(host!.textContent).not.toContain("Physical item")
    expect(host!.textContent).toContain("Listing deleted.")
    expect(host!.querySelector('[data-testid="seller-listing-count"]')?.textContent).toBe("0 products")
  })

  it("saves an edited title through the API and updates the dashboard", async () => {
    await render("product")
    const edit = [...host!.querySelectorAll("button")].find((button) => button.textContent === "Edit listing")!
    await act(async () => { edit.click(); await Promise.resolve() })
    const title = host!.querySelector<HTMLInputElement>('input[maxlength="240"]')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    await act(async () => {
      setValue.call(title, "Updated physical item")
      title.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const form = host!.querySelector("form")!
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await Promise.resolve() })
    expect(api.update).toHaveBeenCalledWith(1, expect.objectContaining({ title: "Updated physical item" }))
    expect(host!.textContent).toContain("Updated physical item")
    expect(host!.textContent).toContain("Listing changes saved.")
  })
})
