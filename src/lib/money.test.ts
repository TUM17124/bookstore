import { describe, expect, it } from "vitest"
import { DEFAULT_CURRENCY, formatMoney } from "./money"

describe("formatMoney (Part C currency setting)", () => {
  it("defaults to today's KES format", () => {
    expect(formatMoney(1500)).toBe("KES 1,500")
    expect(formatMoney("700.00")).toBe("KES 700")
    expect(formatMoney(null)).toBe("KES 0")
  })

  it("follows symbol, position, spacing, decimals and separator", () => {
    expect(formatMoney(1234.5, { ...DEFAULT_CURRENCY, symbol: "$", space: false, decimals: 2 })).toBe("$1,234.50")
    expect(formatMoney(12500, { ...DEFAULT_CURRENCY, symbol: "KSh", position: "after", thousands: "" })).toBe(
      "12500 KSh",
    )
    expect(formatMoney(-50, DEFAULT_CURRENCY)).toBe("KES -50")
  })

  it("matches the backend's money() for the same settings", () => {
    // shop/pricing.py money(): "KES 1,500", "$1,234.50", "12500 KSh"
    expect(formatMoney(1500)).toBe("KES 1,500")
  })
})
