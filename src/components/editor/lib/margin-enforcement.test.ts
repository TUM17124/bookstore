import { describe, it, expect } from "vitest";
import {
  resolveMargins,
  safeRectFromMargins,
  clampPositionToRect,
  clampSizeToRect,
  clampBoundsToMargins,
  overflowsBottomMargin,
  DEFAULT_FALLBACK_MARGIN_PT,
} from "./margin-enforcement";

const A4 = { width: 595.28, height: 841.89 };

describe("resolveMargins", () => {
  it("falls back to the default when the raw margins are null (unknown)", () => {
    expect(resolveMargins(null, A4)).toEqual({
      top: DEFAULT_FALLBACK_MARGIN_PT,
      right: DEFAULT_FALLBACK_MARGIN_PT,
      bottom: DEFAULT_FALLBACK_MARGIN_PT,
      left: DEFAULT_FALLBACK_MARGIN_PT,
    });
  });

  it("falls back when the engine's crop-inset estimate is exactly {0,0,0,0} (a fresh/uncropped page, nothing to estimate)", () => {
    const resolved = resolveMargins({ top: 0, right: 0, bottom: 0, left: 0 }, A4);
    expect(resolved.left).toBe(DEFAULT_FALLBACK_MARGIN_PT);
  });

  // Regression test for the live bug: on a freshly-created blank document,
  // the engine's CropBox-inset estimate came back with a NEGATIVE margin on
  // one side (reproduced live: a 220pt-wide text box could be dragged well
  // past the true 595pt page edge before clamping engaged). The old check
  // only caught the all-exactly-zero case, so this nonsense value sailed
  // through as if it were a real, deliberate margin.
  it("falls back when a margin side is negative (the actual production bug)", () => {
    const resolved = resolveMargins({ top: 36, right: -74, bottom: 36, left: 36 }, A4);
    expect(resolved).toEqual({
      top: DEFAULT_FALLBACK_MARGIN_PT,
      right: DEFAULT_FALLBACK_MARGIN_PT,
      bottom: DEFAULT_FALLBACK_MARGIN_PT,
      left: DEFAULT_FALLBACK_MARGIN_PT,
    });
  });

  it("falls back when a margin is NaN or non-finite", () => {
    expect(resolveMargins({ top: NaN, right: 36, bottom: 36, left: 36 }, A4).top).toBe(
      DEFAULT_FALLBACK_MARGIN_PT,
    );
    expect(
      resolveMargins({ top: 36, right: Infinity, bottom: 36, left: 36 }, A4).right,
    ).toBe(DEFAULT_FALLBACK_MARGIN_PT);
  });

  it("falls back when margins are so large they'd leave no usable safe area", () => {
    const resolved = resolveMargins(
      { top: 500, right: 500, bottom: 500, left: 500 },
      A4,
    );
    expect(resolved.left).toBe(DEFAULT_FALLBACK_MARGIN_PT);
  });

  it("keeps a real, small, deliberately-dragged margin (never exactly {0,0,0,0} or negative)", () => {
    const dragged = { top: 10, right: 10, bottom: 10, left: 10 };
    expect(resolveMargins(dragged, A4)).toEqual(dragged);
  });

  it("keeps asymmetric real margins as-is (top != bottom)", () => {
    const dragged = { top: 50, right: 36, bottom: 20, left: 36 };
    expect(resolveMargins(dragged, A4)).toEqual(dragged);
  });
});

describe("safeRectFromMargins + clampPositionToRect (Fabric scene space)", () => {
  const margins = resolveMargins(null, A4); // the 36pt default
  const rect = safeRectFromMargins(A4, margins);

  it("produces a sane inset rect", () => {
    expect(rect.left).toBe(36);
    expect(rect.top).toBe(36);
    expect(rect.right).toBeCloseTo(A4.width - 36);
    expect(rect.bottom).toBeCloseTo(A4.height - 36);
  });

  it("pulls a box dragged far past the right edge back to the margin", () => {
    const box = { left: 900, top: 100, width: 220, height: 16 };
    const clamped = clampPositionToRect(box, rect);
    expect(clamped.left).toBeCloseTo(rect.right - box.width);
    // The box's right edge must land ON the margin, never past it.
    expect(clamped.left + box.width).toBeLessThanOrEqual(rect.right + 0.01);
  });

  it("pulls a box dragged past the left/top edges back to the margin", () => {
    const box = { left: -500, top: -500, width: 100, height: 20 };
    const clamped = clampPositionToRect(box, rect);
    expect(clamped.left).toBe(rect.left);
    expect(clamped.top).toBe(rect.top);
  });

  it("leaves a box that already fits untouched", () => {
    const box = { left: 100, top: 100, width: 50, height: 20 };
    const clamped = clampPositionToRect(box, rect);
    expect(clamped).toEqual({ left: 100, top: 100 });
  });

  it("caps a resize that would grow past the margin", () => {
    const box = { left: 400, top: 100, width: 400, height: 20 };
    const size = clampSizeToRect(box, rect);
    expect(box.left + size.width).toBeLessThanOrEqual(rect.right + 0.01);
  });

  it("flags bottom-margin overflow correctly", () => {
    const short = { left: 100, top: 100, width: 100, height: 20 };
    const tall = { left: 100, top: 700, width: 100, height: 200 };
    expect(overflowsBottomMargin(short, rect)).toBe(false);
    expect(overflowsBottomMargin(tall, rect)).toBe(true);
  });
});

describe("clampBoundsToMargins (element.bounds — same top-left/Y-down convention as Fabric scene space)", () => {
  const margins = resolveMargins(null, A4);

  it("clamps an out-of-range X/Y typed into the Properties panel", () => {
    const result = clampBoundsToMargins(
      { x: 5000, y: -5000, width: 220, height: 16 },
      margins,
      A4,
    );
    expect(result.x + result.width).toBeLessThanOrEqual(A4.width - 36 + 0.01);
    expect(result.y).toBeGreaterThanOrEqual(36 - 0.01);
  });

  it("does NOT swap top/bottom for an asymmetric margin (regression: the first version of this function did)", () => {
    const asymmetric = { top: 100, right: 36, bottom: 10, left: 36 };
    // A box near the very top of the page should clamp to the TOP margin
    // (100), not the bottom margin (10) — the original bug used bottom's
    // value as the minimum Y, which for top=100/bottom=10 would have wrongly
    // let a box sit at y=10 instead of being pushed down to y=100.
    const result = clampBoundsToMargins(
      { x: 100, y: 0, width: 50, height: 20 },
      asymmetric,
      A4,
    );
    expect(result.y).toBe(100);
  });
});
