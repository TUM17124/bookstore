/**
 * One set of dimensions for the 3D book: boards, spine, page block and the
 * page leaves are all derived from here, so they fit at every page count.
 *
 * Book space: the spine/board meeting plane is x = 0, the front cover faces
 * +z, the fore-edge is at +x, y is up. A board hinges on the line where the
 * spine meets it (x = 0, mid-thickness of the board), so a rotated board
 * never leaves a gap or overlaps the spine.
 */
export type V3 = [number, number, number]
export type Box = { min: V3; max: V3 }

/** Board (cover) thickness. */
export const CT = 0.032
/** Board width, hinge line to fore-edge. */
export const CW = 1.46
/** Board height. */
export const CH = 2.24
/** How far the boards overhang the pages at top, bottom and fore-edge. */
export const SQ = 0.03
/** Spine wall depth (x), outside the hinge line. */
export const SPINE_W = 0.03
/** Page block starts this far in from the hinge line. */
export const GAP = 0.004
/** Clearance between the block and each board's inner face. */
export const CLEAR = 0.0015
/** Spacing between stacked page leaves. */
export const LEAF_DZ = 0.0012
/** Most leaves a book carries (each has a front and a back page). */
export const MAX_LEAVES = 8

/** Page-block thickness from the PDF page count (log curve; 0 = unknown). */
export function blockThickness(pageCount?: number | null): number {
  const n = pageCount ?? 0
  if (!(n > 0)) return 0.34
  return Math.min(0.62, 0.14 + (0.46 * Math.log(1 + n / 5)) / Math.log(1 + 300 / 5))
}

export type BookDims = {
  /** Page-block thickness (distance between the boards' inner faces). */
  T: number
  CT: number
  CW: number
  CH: number
  SQ: number
  /** Leaves resting on the block (they take space off its front). */
  leaves: number
}

export function bookDims(pageCount?: number | null, leaves = 0): BookDims {
  return { T: blockThickness(pageCount), CT, CW, CH, SQ, leaves: Math.max(0, Math.min(MAX_LEAVES, leaves)) }
}

export const frontPivotZ = (d: BookDims) => d.T / 2 + d.CT / 2
export const backPivotZ = (d: BookDims) => -(d.T / 2 + d.CT / 2)

/** Spine: flush with the boards' outer faces, full board height. */
export function spineBox(d: BookDims): Box {
  return { min: [-SPINE_W, -d.CH / 2, -(d.T / 2 + d.CT)], max: [0, d.CH / 2, d.T / 2 + d.CT] }
}

/** A board in its own frame, relative to its hinge (x grows to the fore-edge). */
export function boardLocalBox(d: BookDims): Box {
  return { min: [0, -d.CH / 2, -d.CT / 2], max: [d.CW, d.CH / 2, d.CT / 2] }
}

/** The page block: inset from the boards on top, bottom and fore-edge. */
export function blockBox(d: BookDims): Box {
  return {
    min: [GAP, -(d.CH / 2 - d.SQ), -(d.T / 2 - CLEAR)],
    max: [d.CW - d.SQ, d.CH / 2 - d.SQ, d.T / 2 - CLEAR],
  }
}

/** The page under the last leaf: what you see when every leaf has been turned. */
export function endPageZ(d: BookDims): number {
  return d.T / 2 - CLEAR - d.leaves * LEAF_DZ - 0.0004
}

/** Size of a page leaf (same as the block's face). */
export function leafSize(d: BookDims): { w: number; h: number } {
  return { w: d.CW - d.SQ - GAP, h: d.CH - 2 * d.SQ }
}

/** Where leaf k (0 = top of the stack) rests on the block, and where it
 * lies when flipped onto the open front board. */
export function leafRestZ(d: BookDims, k: number) {
  return d.T / 2 - CLEAR - k * LEAF_DZ
}
/**
 * Where leaf k's hinge is: resting on the block (f = 0) or lying on the inner
 * face of the front board, which is open by `ang` (f = 1). A flipped leaf
 * sits just above the board's inner face (on its normal), the first flipped
 * lowest, so it never sinks into the board at any opening angle.
 */
export function leafHinge(d: BookDims, k: number, f: number, ang: number): [number, number] {
  const fs = Math.max(0, Math.min(1, f))
  const m = fs * fs * (3 - 2 * fs)
  const dist = d.CT / 2 + 0.0008 + k * LEAF_DZ
  const zp = frontPivotZ(d)
  const fx = GAP * Math.cos(ang) + dist * Math.sin(ang)
  const fz = zp + GAP * Math.sin(ang) - dist * Math.cos(ang)
  const rx = GAP
  const rz = leafRestZ(d, k)
  return [rx + (fx - rx) * m, rz + (fz - rz) * m]
}

/** Rotate p about the y axis through pivot, the way three.js does for rotation.y = phi. */
export function rotY(p: V3, pivot: V3, phi: number): V3 {
  const dx = p[0] - pivot[0]
  const dz = p[2] - pivot[2]
  const c = Math.cos(phi)
  const s = Math.sin(phi)
  return [pivot[0] + dx * c + dz * s, p[1], pivot[2] - dx * s + dz * c]
}

function corners(b: Box): V3[] {
  const out: V3[] = []
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z])
  return out
}

export function aabb(points: V3[]): Box {
  const min: V3 = [Infinity, Infinity, Infinity]
  const max: V3 = [-Infinity, -Infinity, -Infinity]
  for (const p of points) for (let i = 0; i < 3; i++) {
    min[i] = Math.min(min[i], p[i])
    max[i] = Math.max(max[i], p[i])
  }
  return { min, max }
}

/** The front board in book space, opened by `angle` radians (0 = closed). */
export function frontBoardCorners(d: BookDims, angle: number): V3[] {
  const pivot: V3 = [0, 0, frontPivotZ(d)]
  return corners(boardLocalBox(d)).map((c) => rotY([pivot[0] + c[0], c[1], pivot[2] + c[2]], pivot, -angle))
}
/** The back board, opened by `angle` radians toward the back. */
export function backBoardCorners(d: BookDims, angle: number): V3[] {
  const pivot: V3 = [0, 0, backPivotZ(d)]
  return corners(boardLocalBox(d)).map((c) => rotY([pivot[0] + c[0], c[1], pivot[2] + c[2]], pivot, angle))
}

/**
 * Profile of a bent page leaf across its width: n+1 points (x, z) from the
 * hinge, for a leaf turned by `psi` and curled by `curl` (extra turn at the
 * free edge). Length is preserved, so a bending page never stretches.
 */
export function leafProfile(w: number, segs: number, psi: number, curl: number): [number, number][] {
  const out: [number, number][] = [[0, 0]]
  const ds = w / segs
  let x = 0
  let z = 0
  for (let i = 0; i < segs; i++) {
    const a = psi + curl * ((i + 0.5) / segs)
    x += ds * Math.cos(a)
    z += ds * Math.sin(a)
    out.push([x, z])
  }
  return out
}
