import { describe, expect, it } from "vitest"
import {
  CT, GAP, SPINE_W, aabb, backBoardCorners, backPivotZ, blockBox, bookDims, frontBoardCorners, frontPivotZ,
  endPageZ, leafHinge, leafProfile, leafRestZ, leafSize, spineBox, rotY,
} from "./geometry"

const EPS = 1e-9
const COUNTS = [0, 1, 8, 40, 72, 300, 5000]
const ANGLES = [0, 0.2, 0.88, Math.PI / 2, 2.2, 2.6, Math.PI]

describe("book geometry fits at every page count", () => {
  for (const pages of COUNTS) {
    for (const leaves of [0, 4, 8]) {
      const d = bookDims(pages, leaves)
      const block = blockBox(d)
      const spine = spineBox(d)

      it(`${pages} pages, ${leaves} leaves: block sits inside the closed boards on top, bottom and fore-edge`, () => {
        const front = aabb(frontBoardCorners(d, 0))
        const back = aabb(backBoardCorners(d, 0))
        for (const board of [front, back]) {
          expect(block.max[0]).toBeLessThan(board.max[0] - 0.02)
          expect(block.max[1]).toBeLessThan(board.max[1] - 0.02)
          expect(block.min[1]).toBeGreaterThan(board.min[1] + 0.02)
        }
        // between the boards' inner faces, never touching them
        expect(block.max[2]).toBeLessThan(front.min[2])
        expect(block.min[2]).toBeGreaterThan(back.max[2])
        // and not poking out past the spine side either
        expect(block.min[0]).toBeGreaterThanOrEqual(GAP - EPS)
      })

      it(`${pages} pages, ${leaves} leaves: boards meet the spine exactly, closed and while opening`, () => {
        for (const a of ANGLES) {
          // the hinge line is the spine's edge, with the board's thickness inside the spine's depth
          const pf: [number, number, number] = [0, 0, frontPivotZ(d)]
          const pb: [number, number, number] = [0, 0, backPivotZ(d)]
          expect(pf[0]).toBeCloseTo(spine.max[0], 12)
          expect(pf[2]).toBeLessThan(spine.max[2])
          expect(pf[2]).toBeGreaterThan(spine.min[2])
          expect(pb[2]).toBeGreaterThan(spine.min[2])
          // the hinge-side edge of a rotated board stays on the hinge line
          const f = frontBoardCorners(d, a).filter((_, i) => i < 4) // the x = 0 corners
          for (const c of f) {
            const r = Math.hypot(c[0] - pf[0], c[2] - pf[2])
            expect(r).toBeLessThanOrEqual(CT / 2 + 1e-9)
          }
          const b = backBoardCorners(d, a).filter((_, i) => i < 4)
          for (const c of b) expect(Math.hypot(c[0] - pb[0], c[2] - pb[2])).toBeLessThanOrEqual(CT / 2 + 1e-9)
        }
        // closed: the boards' hinge edge is exactly the spine's right face; faces are flush
        const front = aabb(frontBoardCorners(d, 0))
        const back = aabb(backBoardCorners(d, 0))
        expect(Math.abs(front.min[0] - spine.max[0])).toBeLessThan(EPS)
        expect(Math.abs(back.min[0] - spine.max[0])).toBeLessThan(EPS)
        expect(Math.abs(front.max[2] - spine.max[2])).toBeLessThan(EPS)
        expect(Math.abs(back.min[2] - spine.min[2])).toBeLessThan(EPS)
        expect(spine.min[1]).toBeCloseTo(front.min[1], 12)
        expect(spine.max[1]).toBeCloseTo(front.max[1], 12)
      })

      it(`${pages} pages, ${leaves} leaves: an opening board never cuts into the page block`, () => {
        for (const a of ANGLES) {
          const pts = frontBoardCorners(d, a)
          // sample the inner face along the board
          const pivot: [number, number, number] = [0, 0, frontPivotZ(d)]
          for (let i = 0; i <= 20; i++) {
            const x = (i / 20) * d.CW
            const p = rotY([pivot[0] + x, 0, pivot[2] - CT / 2], pivot, -a)
            const insideX = p[0] > block.min[0] && p[0] < block.max[0]
            if (insideX) expect(p[2]).toBeGreaterThanOrEqual(block.max[2] - EPS)
          }
          expect(pts.length).toBe(8)
        }
      })
    }
  }

  it("leaves rest inside the block's footprint and flipped leaves clear the open board", () => {
    const d = bookDims(40, 8)
    const { w, h } = leafSize(d)
    const block = blockBox(d)
    expect(GAP + w).toBeCloseTo(block.max[0], 12)
    expect(h).toBeCloseTo(block.max[1] - block.min[1], 12)
    for (let k = 0; k < 8; k++) {
      expect(leafRestZ(d, k)).toBeLessThan(d.T / 2)
      expect(leafRestZ(d, k)).toBeLessThanOrEqual(block.max[2] + 1e-12)
      expect(leafRestZ(d, k)).toBeGreaterThan(endPageZ(d))
    }
    expect(endPageZ(d)).toBeGreaterThan(block.min[2])
    expect(SPINE_W).toBeGreaterThan(0)
  })

  it("a leaf turned onto the open board lies above the board's inner face at every opening angle", () => {
    for (const pages of [8, 72, 300]) {
      const d = bookDims(pages, 8)
      const zp = frontPivotZ(d)
      for (const ang of ANGLES.filter((a) => a > 0)) {
        const n: [number, number] = [Math.sin(ang), -Math.cos(ang)] // inner-face normal
        for (let k = 0; k < 8; k++) {
          const [hx, hz] = leafHinge(d, k, 1, ang)
          const above = n[0] * (hx - 0) + n[1] * (hz - zp) - CT / 2
          expect(above).toBeGreaterThan(0.0007)
          // points along the leaf stay at that height (parallel to the board)
          const [px, pz] = [hx + 1.2 * Math.cos(ang), hz + 1.2 * Math.sin(ang)]
          expect(n[0] * px + n[1] * (pz - zp) - CT / 2).toBeCloseTo(above, 9)
        }
      }
      // resting on the block, closed: just under the front board's inner face
      for (let k = 0; k < 8; k++) {
        const [hx, hz] = leafHinge(d, k, 0, 0)
        expect(hx).toBeCloseTo(GAP, 12)
        expect(hz).toBeLessThan(d.T / 2)
        expect(hz).toBeLessThanOrEqual(blockBox(d).max[2] + 1e-12)
      }
    }
  })

  it("a bent leaf keeps its length", () => {
    for (const curl of [0, 0.4, -0.8, 1.5]) {
      const pts = leafProfile(1.4, 12, 0.7, curl)
      let len = 0
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      expect(len).toBeCloseTo(1.4, 9)
    }
  })
})
