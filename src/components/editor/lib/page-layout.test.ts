import { describe, expect, it } from "vitest";
import {
  PAGE_GAP_PX,
  PAGE_V_PADDING_PX,
  anchorAtContentY,
  computePageLayout,
  contentYForAnchor,
  pageIndexAtScroll,
} from "./page-layout";

const page = (width: number, height: number) => ({ dimensions: { width, height, rotation: 0 as const } });
const pages = [page(595, 842), page(595, 842), page(842, 595), page(595, 842)];

describe("zoom keeps the reading position", () => {
  it("anchors a y to its page and returns to the same page after any zoom", () => {
    for (const from of [0.5, 1, 2, 4]) {
      for (const to of [0.25, 1, 3, 8]) {
        const a = computePageLayout(pages, from);
        // Look at the middle of page 3 (index 2).
        const y = a.slots[2]!.top + a.slots[2]!.height * 0.5;
        const anchor = anchorAtContentY(a.slots, y)!;
        expect(anchor.index).toBe(2);
        const b = computePageLayout(pages, to);
        const y2 = contentYForAnchor(b.slots, anchor)!;
        expect(pageIndexAtScroll(b.slots, y2)).toBe(2);
        expect(y2).toBeCloseTo(b.slots[2]!.top + b.slots[2]!.height * 0.5, 6);
      }
    }
  });

  it("never lands on page 1 for a position further down", () => {
    const a = computePageLayout(pages, 1);
    const y = a.slots[3]!.top + 10;
    const anchor = anchorAtContentY(a.slots, y)!;
    const b = computePageLayout(pages, 0.1);
    expect(anchorAtContentY(b.slots, contentYForAnchor(b.slots, anchor)!)!.index).toBe(3);
  });

  it("snaps a gap or padding position to the nearest page edge", () => {
    const l = computePageLayout(pages, 1);
    expect(anchorAtContentY(l.slots, 0)).toEqual({ index: 0, frac: 0 });
    const gapY = l.slots[0]!.top + l.slots[0]!.height + PAGE_GAP_PX / 2;
    expect(anchorAtContentY(l.slots, gapY)).toEqual({ index: 1, frac: 0 });
    expect(anchorAtContentY(l.slots, l.totalHeight + 500)).toEqual({ index: 3, frac: 1 });
    expect(l.slots[0]!.top).toBe(PAGE_V_PADDING_PX);
  });

  it("handles an empty layout", () => {
    expect(anchorAtContentY([], 100)).toBeNull();
    expect(contentYForAnchor([], { index: 0, frac: 0 })).toBeNull();
  });

  it("reports the widest page so the scroller can size its content", () => {
    expect(computePageLayout(pages, 2).contentWidth).toBe(842 * 2);
  });
});
