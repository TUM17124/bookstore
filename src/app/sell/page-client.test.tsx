// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import SellPage from "./page-client"
import { createListing, marketCategories, submitListing, uploadListingMedia } from "@/lib/marketplace"

const fixtures = vi.hoisted(() => ({
  service: { slug: "consulting", label: "Consulting", description: "", parent: null, icon: "package", image: null, fulfillment_type: "service", viewer_mode: "gallery" as const, viewer_config: {}, pricing_options: ["fixed"], negotiation_enabled: false, moderation_required: true, is_regulated: false, regulated_sale_approved: false, minimum_buyer_age: 0, single_sale: true, auctions_enabled: false, inventory_policy: "booking" as const, inventory_required: false, variants_enabled: false, inventory_visibility: "status" as const, attributes: [], media_slots: [] },
  product: { slug: "electronics", label: "Electronics", description: "", parent: null, icon: "package", image: null, fulfillment_type: "shipping", viewer_mode: "gallery" as const, viewer_config: {}, pricing_options: ["fixed"], negotiation_enabled: false, moderation_required: true, is_regulated: false, regulated_sale_approved: false, minimum_buyer_age: 0, single_sale: true, auctions_enabled: false, inventory_policy: "finite" as const, inventory_required: true, variants_enabled: false, inventory_visibility: "status" as const, attributes: [], media_slots: [] },
  listing: { id: 71 },
}))

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href as string} {...props}>{children}</a> }))
vi.mock("@/lib/site-config", () => ({ useSiteConfig: () => [{ features: { marketplace: true } }, true] }))
vi.mock("@/lib/money", () => ({ useCurrency: () => ({ code: "KES", symbol: "KES", position: "before", space: true, decimals: 2, thousands: "," }) }))
vi.mock("@/lib/marketplace", () => ({
  conditionOptions: vi.fn().mockResolvedValue([]),
  createListing: vi.fn().mockResolvedValue(fixtures.listing),
  marketCategories: vi.fn().mockResolvedValue([fixtures.product, fixtures.service]),
  submitListing: vi.fn().mockResolvedValue({ status: "pending" }),
  uploadListingMedia: vi.fn().mockResolvedValue(undefined),
}))

describe("product and service listing forms", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    history.replaceState(null, "", "/publish/?category=consulting")
    vi.mocked(createListing).mockClear()
    vi.mocked(submitListing).mockClear()
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => { act(() => root.unmount()); host.remove() })

  it("submits a selected service to the service category and offers a direct management link", async () => {
    await act(async () => { root.render(<SellPage />); await Promise.resolve(); await Promise.resolve() })
    expect(host.querySelector("h1")?.textContent).toBe("Offer a service")
    const category = host.querySelector("form select")!
    expect((category as HTMLSelectElement).value).toBe("consulting")
    await act(async () => {
      ;(host.querySelector("input[name='title']") as HTMLInputElement).value = "Business consulting"
      host.querySelector("input[name='title']")!.dispatchEvent(new Event("input", { bubbles: true }))
      ;(host.querySelector("textarea[name='description']") as HTMLTextAreaElement).value = "Consulting services with defined scope."
      host.querySelector("textarea[name='description']")!.dispatchEvent(new Event("input", { bubbles: true }))
      ;(host.querySelector("input[name='price_amount']") as HTMLInputElement).value = "1200"
      host.querySelector("input[name='price_amount']")!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => (host.querySelector("button[value='publish']") as HTMLButtonElement).click())
    expect(createListing).toHaveBeenCalledWith(expect.objectContaining({ category: "consulting" }))
    expect(submitListing).toHaveBeenCalledWith(71)
    expect(host.textContent).toContain("Your service was submitted for review.")
    expect(host.querySelector("a[href='/dashboard?tab=services']")?.textContent).toBe("Manage this service")
  })

  it("saves a product as a draft without submitting it for review", async () => {
    history.replaceState(null, "", "/publish/?category=electronics")
    await act(async () => { root.render(<SellPage />); await Promise.resolve(); await Promise.resolve() })
    expect(host.querySelector("h1")?.textContent).toBe("Sell a product")
    const form = host.querySelector("form")!
    const title = form.querySelector("input[name='title']") as HTMLInputElement
    const desc = form.querySelector("textarea[name='description']") as HTMLTextAreaElement
    const qty = form.querySelector("input[name='stock_quantity']") as HTMLInputElement
    const price = form.querySelector("input[name='price_amount']") as HTMLInputElement
    title.value = "Desk monitor"; title.dispatchEvent(new Event("input", { bubbles: true }))
    desc.value = "Monitor listing draft."; desc.dispatchEvent(new Event("input", { bubbles: true }))
    qty.value = "3"; qty.dispatchEvent(new Event("input", { bubbles: true }))
    price.value = "8500"; price.dispatchEvent(new Event("input", { bubbles: true }))
    await act(async () => (host.querySelector("button[value='draft']") as HTMLButtonElement).click())
    expect(createListing).toHaveBeenCalledWith(expect.objectContaining({ category: "electronics", inventory: expect.objectContaining({ quantity: 3 }) }))
    expect(submitListing).not.toHaveBeenCalled()
    expect(host.textContent).toContain("Product draft saved.")
    expect(host.querySelector("a[href='/dashboard?tab=products']")?.textContent).toBe("Manage this product")
  })
})
