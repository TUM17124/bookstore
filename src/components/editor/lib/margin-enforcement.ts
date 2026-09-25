/**
 * margin-enforcement.ts
 *
 * Pure geometry for redesign #4 (content margins): keeping NEW placement and
 * interactive move/resize inside a page's safe area. This is deliberately a
 * thin layer on top of the EXISTING Word-like margins system
 * (`lib/page-margins.ts` reads/writes the real per-page `PageMargins` from the
 * GigaPDF engine's editor-metadata sidecar; `lib/margin-rotation.ts` maps them
 * into screen space) — there is no separate/fixed margin concept here, only
 * the math to turn a `PageMargins` + page size into a clampable rect and clamp
 * boxes into it.
 *
 * Fabric's scene space is top-left-origin, Y-down — the SAME convention
 * `PageMargins`'s per-side insets already use (each side is a distance from
 * that edge, orientation-agnostic), so no further coordinate flip is needed
 * here once the margins have been through `screenMarginsFromPage`.
 *
 * No DOM, no Fabric import — trivially unit-testable.
 */

import type { PageMargins } from "./page-margins";

export interface PageSize {
  width: number;
  height: number;
}

export interface SafeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The safe-area rect (scene units) for a page of `size`, given SCREEN-space
 * margins (already passed through `screenMarginsFromPage` for rotation).
 */
export function safeRectFromMargins(size: PageSize, margins: PageMargins): SafeRect {
  return {
    left: margins.left,
    top: margins.top,
    right: size.width - margins.right,
    bottom: size.height - margins.bottom,
  };
}

export interface BoundedBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Clamp a box's top-left so it stays inside `rect`. A box WIDER/TALLER than
 * the safe area is pinned to the near edge rather than centered or rejected
 * — it can't fully fit either way, and pinning keeps the result predictable.
 */
export function clampPositionToRect(
  box: BoundedBox,
  rect: SafeRect,
): { left: number; top: number } {
  const maxLeft = Math.max(rect.left, rect.right - box.width);
  const maxTop = Math.max(rect.top, rect.bottom - box.height);
  return {
    left: Math.min(Math.max(box.left, rect.left), maxLeft),
    top: Math.min(Math.max(box.top, rect.top), maxTop),
  };
}

/**
 * Clamp a box's width/height (top-left fixed) so its far edge never crosses
 * `rect`'s far edge — "stop at the margin instead of going past it" per spec,
 * rather than pushing the box back into place after the fact.
 */
export function clampSizeToRect(
  box: BoundedBox,
  rect: SafeRect,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.min(box.width, rect.right - box.left)),
    height: Math.max(1, Math.min(box.height, rect.bottom - box.top)),
  };
}

/** Whether a box's bottom edge has grown past the safe area's bottom margin. */
export function overflowsBottomMargin(box: BoundedBox, rect: SafeRect): boolean {
  return box.top + box.height > rect.bottom + 0.5; // 0.5pt tolerance vs FP jitter
}
