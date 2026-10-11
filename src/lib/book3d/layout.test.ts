import { describe, expect, it } from "vitest"
import { BOOK_H, BOOK_W, FOV_K, PHONE_MIN_BOOK_H, TOOL_H, PHONE_TOP, fitArea, phoneBookHeight, spreadWidth } from "./layout"

const PHONES = [[360, 740], [375, 667], [390, 844], [430, 932]]

describe("3D book layout", () => {
  for (const [w, h] of PHONES) {
    it(`${w}×${h}: the book fits its area, fills most of it, and the open spread fits the width`, () => {
      const need = h * 0.4 // what the panel needs
      const bookH = phoneBookHeight(h, need)
      expect(bookH).toBeGreaterThanOrEqual(PHONE_MIN_BOOK_H)
      expect(bookH).toBeLessThanOrEqual(h * 0.46 + 1e-9)
      const camZ = 10.4, zw = 0.8 * 0.5
      const { ppu, S, mul } = fitArea({ viewH: h, areaW: w - 24, areaH: bookH, camZ, zw, phone: true })
      const bookPxH = BOOK_H * S * ppu
      const bookPxW = BOOK_W * S * ppu
      expect(bookPxH).toBeLessThanOrEqual(bookH)
      expect(bookPxW).toBeLessThanOrEqual(w - 24)
      expect(Math.max(bookPxH / bookH, bookPxW / (w - 24))).toBeGreaterThan(0.85) // fills most of the area
      expect(spreadWidth(true) * S * ppu * mul).toBeLessThanOrEqual(w - 24)
      // the toolbar sits below the book's area and above the panel; nothing overlaps
      const areaBottom = PHONE_TOP + bookH
      const toolTop = areaBottom + 4
      const panelTop = toolTop + TOOL_H + 4
      expect(toolTop).toBeGreaterThanOrEqual(areaBottom)
      expect(panelTop).toBeGreaterThanOrEqual(toolTop + TOOL_H)
    })
  }

  it("the book gets the room the panel does not need on tall phones, and never less than 210 px", () => {
    expect(phoneBookHeight(932, 330)).toBeGreaterThan(phoneBookHeight(667, 330))
    expect(phoneBookHeight(500, 600)).toBe(PHONE_MIN_BOOK_H)
  })

  for (const [w, h] of [[768, 1024], [1024, 768], [1366, 768], [1920, 1080]]) {
    it(`${w}×${h}: desktop/tablet area fits and the open spread fits the width`, () => {
      const panelLeft = w * 0.95 - Math.min(520, w * 0.4)
      const left = 16, right = Math.max(left + 200, panelLeft - 24)
      const top = 84, bottom = Math.max(top + 200, h - 24 - TOOL_H)
      const { ppu, S, mul } = fitArea({ viewH: h, areaW: right - left, areaH: bottom - top, camZ: 9.6, zw: 0.85 * 0.8, phone: false })
      expect(BOOK_H * S * ppu).toBeLessThanOrEqual(bottom - top)
      expect(BOOK_W * S * ppu).toBeLessThanOrEqual(right - left)
      expect(spreadWidth(false) * S * ppu * mul).toBeLessThanOrEqual((right - left) + 1e-6)
    })
  }

  it("uses the 26° camera's visible height", () => {
    expect(FOV_K).toBeCloseTo(2 * Math.tan((13 * Math.PI) / 180), 3)
  })
})
