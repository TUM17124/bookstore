// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageObject } from "@giga-pdf/types";
import { useViewStore } from "@giga-pdf/editor";
import { PagesSidebar } from "./pages-sidebar";
import { useFocusedPageIndex } from "@/hooks/use-focused-page-index";

const pages = Array.from({ length: 12 }, (_, i) => ({
  pageId: `p${i}`,
  pageNumber: i + 1,
  dimensions: { width: 595, height: 842, rotation: 0 },
  elements: [],
})) as unknown as PageObject[];

let root: Root | null = null;
let el: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  useViewStore.getState().setCurrentPageIndex(0);
});
async function render(ui: React.ReactElement) {
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(ui));
}

/** What the page shell renders: the indicator text and the sidebar, fed by the hook. */
function Shell({ continuous, docIndex }: { continuous: boolean; docIndex: number }) {
  const focused = useFocusedPageIndex(continuous, docIndex, pages.length);
  return (
    <>
      <p data-testid="indicator">{`Page ${focused + 1} of ${pages.length}`}</p>
      <PagesSidebar pages={pages} currentPageIndex={focused} onPageSelect={vi.fn()} />
    </>
  );
}
const indicator = () => document.querySelector('[data-testid="indicator"]')!.textContent;
const highlighted = () => [...document.querySelectorAll(".page-thumbnail")].map((n, i) => (n.getAttribute("data-current") ? i : -1)).filter((i) => i >= 0);

describe("Page X of Y and thumbnail highlight follow the scroll", () => {
  it("continuous mode: both follow the view store as the user scrolls, whatever page was clicked", async () => {
    await render(<Shell continuous docIndex={0} />);
    expect(indicator()).toBe("Page 1 of 12");
    expect(highlighted()).toEqual([0]);
    for (const idx of [4, 9, 2]) {
      await act(async () => useViewStore.getState().setCurrentPageIndex(idx));
      expect(indicator()).toBe(`Page ${idx + 1} of 12`);
      expect(highlighted()).toEqual([idx]);
    }
  });

  it("single-page mode keeps using the document's own current page", async () => {
    await render(<Shell continuous={false} docIndex={5} />);
    await act(async () => useViewStore.getState().setCurrentPageIndex(8));
    expect(indicator()).toBe("Page 6 of 12");
    expect(highlighted()).toEqual([5]);
  });

  it("clamps a stale index after pages were deleted", async () => {
    await render(<Shell continuous docIndex={0} />);
    await act(async () => useViewStore.getState().setCurrentPageIndex(99));
    expect(indicator()).toBe("Page 12 of 12");
  });

  it("scrolls the highlighted thumbnail into view inside the list (never the window)", async () => {
    const windowScroll = vi.spyOn(window, "scrollTo");
    await render(<Shell continuous docIndex={0} />);
    const list = document.querySelector('[data-testid="pages-list"]') as HTMLElement;
    // jsdom has no layout: give the list a 300px window over 150px-tall thumbnails.
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 300 });
    [...list.children].forEach((child, i) => {
      Object.defineProperty(child, "offsetTop", { configurable: true, value: i * 150 });
      Object.defineProperty(child, "offsetHeight", { configurable: true, value: 140 });
    });
    await act(async () => useViewStore.getState().setCurrentPageIndex(8));
    expect(list.scrollTop).toBeGreaterThan(0);
    expect(list.scrollTop).toBeLessThanOrEqual(8 * 150);
    expect(windowScroll).not.toHaveBeenCalled();
  });
});
