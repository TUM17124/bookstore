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

/** Fallback safe-area inset (PDF points) used by {@link resolveMargins}. */
export const DEFAULT_FALLBACK_MARGIN_PT = 36;

/**
 * The real per-page margins system (`lib/page-margins.ts`) estimates a
 * page's margin from its CropBox→MediaBox inset when nothing was ever
 * explicitly dragged. A freshly created or never-cropped page has NO inset
 * to estimate from, so that estimate comes back as exactly `{0,0,0,0}` — a
 * degenerate "nothing to estimate", not a deliberate zero margin (no real
 * document sets zero on all four sides at once). Treat that, and truly
 * unknown (`null`) margins, as "not configured yet" and fall back to a sane
 * default instead of leaving placement completely unconstrained — an actual
 * dragged value (even a small one) always wins since it's never exactly
 * `{0,0,0,0}`. Shared by every margin-enforcement call site so the fallback
 * behaves identically everywhere (Fabric canvas, Properties panel fields).
 */
export function resolveMargins(raw: PageMargins | null | undefined): PageMargins {
  const isDegenerate =
    !raw || (raw.top === 0 && raw.right === 0 && raw.bottom === 0 && raw.left === 0);
  return isDegenerate
    ? {
        top: DEFAULT_FALLBACK_MARGIN_PT,
        right: DEFAULT_FALLBACK_MARGIN_PT,
        bottom: DEFAULT_FALLBACK_MARGIN_PT,
        left: DEFAULT_FALLBACK_MARGIN_PT,
      }
    : raw;
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

/**
 * Clamp an element's PDF USER SPACE bounds (bottom-left origin, Y increases
 * upward — the `element.bounds` convention used by the Properties panel's X/
 * Y/Width/Height fields and page.tsx's handleElementUpdate) into `margins`.
 * DELIBERATELY separate from {@link clampPositionToRect}/{@link
 * clampSizeToRect} above, which work in Fabric's scene space (top-left
 * origin, Y down) — mixing the two conventions up is exactly the
 * top-left/bottom-left bug this file exists to avoid. No rotation mapping
 * needed here: `element.bounds` is already page-intrinsic, the same frame
 * `PageMargins` itself is defined in (only the Fabric canvas render is in
 * rotated/screen space).
 */
export function clampBoundsToMargins(
  bounds: { x: number; y: number; width: number; height: number },
  margins: PageMargins,
  pageSize: PageSize,
): { x: number; y: number; width: number; height: number } {
  const minX = margins.left;
  const maxX = pageSize.width - margins.right;
  const minY = margins.bottom;
  const maxY = pageSize.height - margins.top;

  const width = Math.max(1, Math.min(bounds.width, maxX - minX));
  const height = Math.max(1, Math.min(bounds.height, maxY - minY));

  const x = Math.min(Math.max(bounds.x, minX), Math.max(minX, maxX - width));
  const y = Math.min(Math.max(bounds.y, minY), Math.max(minY, maxY - height));

  return { x, y, width, height };
}
