// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageObject } from "@giga-pdf/types";
import { useViewStore } from "@giga-pdf/editor";

vi.mock("./page-slot", () => ({ PageSlot: () => null }));
vi.mock("./lib/page-render-pool", () => ({ PageRenderPool: class {} }));
vi.mock("@/lib/pdf-editor/client-logger", () => ({ clientLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { ContinuousPageView } from "./continuous-page-view";
import { computePageLayout } from "./lib/page-layout";

const A4 = { width: 595, height: 842, rotation: 0 as const };
const pages = Array.from({ length: 6 }, (_, i) => ({ pageId: `p${i}`, pageNumber: i + 1, dimensions: A4, elements: [] })) as unknown as PageObject[];

let root: Root | null = null;
let el: HTMLDivElement | null = null;
let scrollY = 0;
// The scroller sits 50px below the top of the document (site header + toolbar).
const DOC_TOP = 50;
const scrollTo = vi.fn();

function mountedRoot() {
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  return root;
}
function view(zoom: number) {
  return <ContinuousPageView pages={pages} zoom={zoom} pdfFile={null} activePageIndex={0} onActivatePage={() => {}} />;
}
const frame = () => new Promise((r) => setTimeout(r, 40));
async function scrollWindow(y: number) {
  scrollY = y;
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await frame();
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  scrollY = 0;
  scrollTo.mockReset();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ top: DOC_TOP - scrollY, left: 0, right: 800, bottom: 0, width: 800, height: 0, x: 0, y: DOC_TOP - scrollY, toJSON: () => ({}) }) as DOMRect,
  );
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  window.scrollTo = ((opts: ScrollToOptions) => {
    scrollY = opts.top ?? 0;
    scrollTo(opts);
  }) as typeof window.scrollTo;
  useViewStore.getState().setCurrentPageIndex(0);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  act(() => root?.unmount());
  el?.remove();
  root = null;
});

describe("ContinuousPageView layout", () => {
  it("keeps zoomed pages inside a horizontally scrolling box instead of overflowing the column", async () => {
    await act(async () => mountedRoot().render(view(4)));
    const scroller = document.querySelector('[data-testid="continuous-scroller"]') as HTMLElement;
    expect(scroller.className).toContain("overflow-x-auto");
    expect(scroller.className).toContain("overflow-y-hidden");
    const content = scroller.firstElementChild as HTMLElement;
    // widest page (595 * 4) + 2 * 16 padding
    expect(content.style.minWidth).toBe(`${595 * 4 + 32}px`);
    expect(content.style.width).toBe("100%");
  });

  it("at low zoom the content simply fills the column (no forced width beyond the page)", async () => {
    await act(async () => mountedRoot().render(view(0.5)));
    const content = (document.querySelector('[data-testid="continuous-scroller"]') as HTMLElement).firstElementChild as HTMLElement;
    expect(content.style.minWidth).toBe(`${595 * 0.5 + 32}px`);
  });

  it("puts the page sentinels in a strip pinned to the scroller's left edge", async () => {
    await act(async () => mountedRoot().render(view(1)));
    const sentinels = document.querySelectorAll("[data-page-index]");
    expect(sentinels).toHaveLength(6);
    expect((sentinels[0]!.parentElement as HTMLElement).className).toContain("sticky");
  });
});

describe("ContinuousPageView reading position", () => {
  it("reports the page in view as the user scrolls (feeds the 'Page X of Y' indicator)", async () => {
    await act(async () => mountedRoot().render(view(1)));
    const { slots } = computePageLayout(pages, 1);
    await scrollWindow(DOC_TOP + slots[3]!.top);
    expect(useViewStore.getState().currentPageIndex).toBe(3);
    await scrollWindow(0);
    expect(useViewStore.getState().currentPageIndex).toBe(0);
  });

  it("zooming keeps the same page in view instead of jumping back toward page 1", async () => {
    const r = mountedRoot();
    await act(async () => r.render(view(1)));
    const before = computePageLayout(pages, 1).slots;
    // Look at the middle of page 5 (index 4), centred on the 800px viewport.
    await scrollWindow(DOC_TOP + before[4]!.top + before[4]!.height / 2 - 400);
    expect(useViewStore.getState().currentPageIndex).toBe(4);

    for (const zoom of [2, 0.5, 3, 1]) {
      scrollTo.mockClear();
      await act(async () => r.render(view(zoom)));
      await frame();
      const slots = computePageLayout(pages, zoom).slots;
      const expectedTop = DOC_TOP + Math.max(0, slots[4]!.top + slots[4]!.height / 2 - 400);
      expect(scrollTo).toHaveBeenCalled();
      expect(scrollY).toBeCloseTo(expectedTop, 3);
      expect(useViewStore.getState().currentPageIndex).toBe(4);
    }
  });
});
