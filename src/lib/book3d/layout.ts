/** Where the 3D book goes on screen: it fills its own area, the toolbar sits under it. */

/** Visible height per unit of camera distance: 2·tan(13°), for the 26° camera. */
export const FOV_K = 0.4617
export const BOOK_H = 2.3 // book height incl. a little perspective
export const BOOK_W = 1.6 // closed, turned a little
export const TOOL_H = 56 // toolbar row under the book
export const PHONE_TOP = 76 // below the site header
export const PHONE_MIN_BOOK_H = 210

export function spreadWidth(phone: boolean) {
  // open; the turned-up left board is nearer the camera, so it looks wider
  return phone ? 3.7 : 4.4
}

/** Scale (and the shrink for the open spread) that fit a book into an area of areaW × areaH px. */
export function fitArea(o: { viewH: number; areaW: number; areaH: number; camZ: number; zw: number; phone: boolean }) {
  const ppu = o.viewH / (FOV_K * (o.camZ - o.zw)) // px per world unit at the book
  const S = Math.min((o.areaH * 0.9) / (BOOK_H * ppu), (o.areaW * 0.94) / (BOOK_W * ppu))
  const mul = Math.max(0.3, Math.min(1, (o.areaW * 0.96) / (spreadWidth(o.phone) * ppu * S)))
  return { ppu, S, mul }
}

/** Phone: the book gets everything the panel does not need (at least 210 px, at most 46 % of the screen). */
export function phoneBookHeight(viewH: number, panelNeed: number) {
  return Math.max(PHONE_MIN_BOOK_H, Math.min(viewH * 0.46, viewH - PHONE_TOP - TOOL_H - panelNeed - 24))
}
