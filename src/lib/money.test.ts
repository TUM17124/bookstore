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

  it("rounds DOWN like the server (shown = charged)", () => {
    expect(formatMoney("139.30")).toBe("KES 139")
    expect(formatMoney(276.99)).toBe("KES 276")
    expect(formatMoney(97.3)).toBe("KES 97")
    expect(formatMoney(-97.3)).toBe("KES -97")
    const two = { ...DEFAULT_CURRENCY, decimals: 2 }
    expect(formatMoney(139.305, two)).toBe("KES 139.30")
    expect(formatMoney(0.29, two)).toBe("KES 0.29") // no float slip (0.29 * 100 = 28.999...)
    expect(formatMoney(1.005, two)).toBe("KES 1.00")
  })

  it("matches the backend's money() for the same settings", () => {
    // shop/pricing.py money(): "KES 1,500", "$1,234.50", "12500 KSh"
    expect(formatMoney(1500)).toBe("KES 1,500")
  })
})
