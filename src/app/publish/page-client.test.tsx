// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import PublishPage from "./page-client"
import { marketplaceCategoryIcon } from "@/lib/categories"
import { publishingDescription, publishingKind } from "./departments"
import type { CategoryInfo } from "@/lib/api"

const testState = vi.hoisted(() => ({ params: new URLSearchParams() }))
const departments: CategoryInfo[] = [
  { slug: "books", label: "Books", icon: "book-open", description: "Demo books text", viewer_mode: "book_3d", fulfillment_type: "digital_download", show_in_navbar: true },
  { slug: "cars-vehicles", label: "Cars and vehicles", icon: "book-open", description: "", viewer_mode: "gallery", fulfillment_type: "shipping", show_in_navbar: true },
  { slug: "digital-downloads", label: "Digital downloads", icon: "book-open", description: "DEMO / NOT FOR SALE", viewer_mode: "gallery", fulfillment_type: "digital_download", show_in_navbar: true },
  { slug: "consulting", label: "Consulting", icon: "briefcase", description: "Example services", viewer_mode: "gallery", fulfillment_type: "service", show_in_navbar: true },
  { slug: "unmapped", label: "Collectibles", icon: "book-open", description: "", viewer_mode: "gallery", fulfillment_type: "pickup", show_in_navbar: true },
]

vi.mock("next/navigation", () => ({ useSearchParams: () => testState.params }))
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href as string} {...props}>{children}</a> }))
vi.mock("@/lib/categories", async () => {
  const actual = await vi.importActual<typeof import("@/lib/categories")>("@/lib/categories")
  return { ...actual, useCategories: () => ({ all: departments, ready: true, navbar: [] }) }
})
vi.mock("@/lib/site-config", () => ({
  useSiteConfig: () => [{ features: { marketplace: true, publishing: true, auctions: true } }, true],
  useText: (key: string) => key === "publish.entry_title" ? "Sell and publish on PlugYard" : "Choose a publishing path.",
}))
vi.mock("@/components/book-publish-form", () => ({ default: ({ initialCategory }: { initialCategory: string }) => <div data-testid="book-form" data-category={initialCategory}>Book publishing form</div> }))
vi.mock("@/app/sell/page-client", () => ({ default: () => <div>Listing form</div> }))

describe("Sell & Publish departments", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    testState.params = new URLSearchParams()
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => { act(() => root.unmount()); host.remove() })

  it("separates book, product, service, and auction entry points and routes departments by fulfillment", async () => {
    await act(async () => root.render(<PublishPage />))
    expect(host.textContent).toContain("Publish a book")
    expect(host.textContent).toContain("Sell products")
    expect(host.textContent).toContain("Offer a service")
    expect(host.textContent).toContain("Create an auction")
    expect(host.querySelector("#product-departments")).toBeTruthy()
    expect(host.querySelector("#service-departments")?.textContent).toContain("Consulting")
    expect(host.querySelector("#product-departments")?.textContent).not.toContain("Consulting")
    expect(host.querySelector('a[href="/publish/?kind=book"]')).toBeTruthy()
    expect(host.querySelector('a[href="/auctions/?create=1"]')).toBeTruthy()
    expect(host.querySelector('a[href="/publish/?category=cars-vehicles"]')?.textContent).toContain("List in this department")
    expect(host.querySelector('a[href="/publish/?category=consulting"]')?.textContent).toContain("Offer this service")
  })

  it("uses semantic icons and replaces missing or demonstration descriptions without hardcoding a category list", () => {
    const cars = departments[1]
    const downloads = departments[2]
    expect(marketplaceCategoryIcon(cars.label, cars.slug, cars.icon)).toBe(marketplaceCategoryIcon("Car", "car", "car"))
    expect(marketplaceCategoryIcon(downloads.label, downloads.slug, downloads.icon)).toBe(marketplaceCategoryIcon("Download", "download", "download"))
    expect(marketplaceCategoryIcon("Collectibles", "unmapped", "book-open", false, "pickup")).toBe(marketplaceCategoryIcon("General", "general", "package"))
    expect(publishingKind(departments[3])).toBe("service")
    expect(publishingDescription(cars)).toMatch(/car or vehicle/i)
    expect(publishingDescription(downloads)).toMatch(/digital files or downloads/i)
    expect(publishingDescription(departments[4])).toMatch(/Collectibles listing/i)
    expect(publishingDescription(downloads)).not.toMatch(/demo|not for sale/i)
  })

  it("routes selected book departments to the book form with the selected category", async () => {
    testState.params = new URLSearchParams("kind=book&category=books")
    await act(async () => root.render(<PublishPage />))
    expect(host.querySelector('[data-testid="book-form"]')?.getAttribute("data-category")).toBe("books")
  })

  it("routes product and service categories into the listing form", async () => {
    testState.params = new URLSearchParams("category=consulting")
    await act(async () => root.render(<PublishPage />))
    expect(host.textContent).toContain("Listing form")
  })
})
