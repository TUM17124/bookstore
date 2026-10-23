import { describe, expect, it } from "vitest"
import { inventoryLabel, type InventorySummary } from "./marketplace"

const summary = (overrides: Partial<InventorySummary> = {}): InventorySummary => ({
  policy: "finite", configured: true, in_stock: true,
  variants: [{ variant_id: null, policy: "finite", in_stock: true, low_stock: false, available_quantity: 5 }],
  ...overrides,
})

describe("marketplace inventory presentation", () => {
  it("shows exact finite stock only when supplied by the API", () => {
    expect(inventoryLabel(summary()).label).toBe("5 in stock")
  })
  it("uses a low-stock warning without inventing a hidden quantity", () => {
    expect(inventoryLabel(summary({ variants: [{ variant_id: null, policy: "finite", in_stock: true, low_stock: true }] }))).toEqual({ label: "Low stock", low: true })
  })
  it("blocks unavailable tracked stock", () => {
    expect(inventoryLabel(summary({ in_stock: false }))).toEqual({ label: "Out of stock", low: false })
  })
  it("keeps explicit unlimited digital availability separate from physical stock", () => {
    expect(inventoryLabel(summary({ policy: "unlimited", configured: true, variants: [] }))).toEqual({ label: "Available", low: false })
  })
})
