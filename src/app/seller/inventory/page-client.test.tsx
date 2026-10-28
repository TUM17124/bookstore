// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import InventoryClient from "./page-client"

const api = vi.hoisted(() => ({ confirm: vi.fn(), inventory: vi.fn(), listings: vi.fn(), update: vi.fn() }))

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href as string} {...props}>{children}</a> }))
vi.mock("@/lib/marketplace", () => ({
  confirmSellerAvailability: api.confirm,
  listingInventory: api.inventory,
  listingPrice: () => "KES 100",
  myListings: api.listings,
  updateListingInventory: api.update,
}))

const listing = (inactive_paused_at: string | null) => ({
  id: 12, seller: { id: 2, name: "Seller" }, category: "items", title: "Test item", slug: "test-item",
  description_text: "Test", price_type: "fixed" as const, price_amount: "100", price_min: null, price_max: null,
  currency: "KES", fulfillment_type: "shipping", status: "active", moderation_status: "pending",
  published_at: null, media: [], viewer: { mode: "gallery" as const, config: {} }, url: "/listings/test-item/",
  legacy_book_id: null, inventory_summary: { policy: "finite" as const, configured: true, in_stock: true, variants: [] },
  checkout_disabled: false, is_demo: false, inactive_paused_at,
})

describe("inventory dormant listing recovery feedback", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    api.listings.mockResolvedValueOnce({ results: [listing("2026-10-01T00:00:00Z")] }).mockResolvedValue({ results: [listing(null)] })
    api.inventory.mockResolvedValue({ rows: [] })
    api.confirm.mockResolvedValue({ restored: [12], skipped: [], message: "Availability confirmed.", skipped_reasons: {}, requires_moderation: true })
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
    vi.clearAllMocks()
  })

  async function render() {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(<InventoryClient embedded />))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const item = [...host!.querySelectorAll("button")].find((button) => button.textContent?.includes("Test item"))!
    await act(async () => { item.click(); await Promise.resolve() })
  }

  it("surfaces server skip reasons instead of reporting a false success", async () => {
    api.confirm.mockResolvedValueOnce({ restored: [], skipped: [12], message: "Configure stock first.", skipped_reasons: { "12": "Configure available stock before restoring this listing." }, requires_moderation: false })
    await render()
    const action = [...host!.querySelectorAll("button")].find((button) => button.textContent === "Confirm inventory and reactivate")!
    await act(async () => { action.click(); await Promise.resolve() })
    expect(host!.textContent).toContain("Configure available stock before restoring this listing.")
    expect(host!.textContent).toContain("Confirm inventory and reactivate")
  })

  it("keeps Books out of ordinary seller inventory management", async () => {
    api.listings.mockReset().mockResolvedValue({ results: [
      listing(null),
      { ...listing(null), id: 13, title: "Published book", legacy_book_id: 55, viewer: { mode: "book_3d", config: {} } },
    ] })
    await act(async () => {
      host = document.createElement("div")
      document.body.append(host)
      root = createRoot(host)
      root.render(<InventoryClient embedded />)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(host!.textContent).toContain("Test item")
    expect(host!.textContent).not.toContain("Published book")
  })

  it("refreshes the selected listing after successful moderated recovery", async () => {
    await render()
    const action = [...host!.querySelectorAll("button")].find((button) => button.textContent === "Confirm inventory and reactivate")!
    await act(async () => { action.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(api.confirm).toHaveBeenCalledWith([12])
    expect(api.listings).toHaveBeenCalledTimes(2)
    expect(host!.textContent).toContain("awaiting administrator review")
    expect(host!.textContent).not.toContain("Confirm inventory and reactivate")
  })

  it("locks the recovery action while the server request is pending", async () => {
    let finish!: (value: { restored: number[]; skipped: number[]; message: string; skipped_reasons: Record<string, string>; requires_moderation: boolean }) => void
    api.confirm.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await render()
    const action = [...host!.querySelectorAll("button")].find((button) => button.textContent === "Confirm inventory and reactivate")!
    await act(async () => { action.click(); await Promise.resolve() })
    const pending = [...host!.querySelectorAll("button")].find((button) => button.textContent?.includes("Confirming"))!
    expect((pending as HTMLButtonElement).disabled).toBe(true)
    await act(async () => {
      finish({ restored: [12], skipped: [], message: "Availability confirmed.", skipped_reasons: {}, requires_moderation: true })
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })
    expect(api.confirm).toHaveBeenCalledTimes(1)
  })
})
