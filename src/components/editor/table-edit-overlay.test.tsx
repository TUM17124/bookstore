// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableStructureInfo } from "@giga-pdf/api";
import { TableEditOverlay, frameToScreenRect } from "./table-edit-overlay";

let root: Root | null = null;
let el: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
});
async function render(ui: React.ReactElement) {
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(ui));
}

const cell = (row: number, col: number, text: string) => ({ row, col, colSpan: 1, rowSpan: 1, sourceIndices: [], text });
const table = (over: Partial<TableStructureInfo> = {}): TableStructureInfo => ({
  pageNumber: 1,
  tableIndexOnPage: 0,
  rowCount: 2,
  colCount: 2,
  frame: { x: 60, y: 142, w: 360, h: 112 },
  cells: [cell(0, 0, "a"), cell(0, 1, "b"), cell(1, 0, "c"), cell(1, 1, "d")],
  ...over,
});

const props = (tables: TableStructureInfo[], over: Record<string, unknown> = {}) => ({
  tables,
  zoom: 2,
  selectedTableIndex: 0,
  activeCell: null,
  onSelectTable: vi.fn(),
  onAction: vi.fn(),
  onStyleAction: vi.fn(),
  ...over,
});
const byLabel = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;

describe("table overlay frames", () => {
  it("frames arrive in displayed page space (top-left origin): no vertical flip, scaled by zoom", () => {
    // A table 142pt from the top of the page, 112pt tall, drawn at 200% zoom.
    expect(frameToScreenRect({ x: 60, y: 142, w: 360, h: 112 }, 2)).toEqual({ left: 120, top: 284, width: 720, height: 224 });
    expect(frameToScreenRect(null, 2)).toBeNull();
  });

  it("draws the selection box where the frame says, whatever the page size or rotation", async () => {
    for (const [w, h, rotation] of [[595, 842, 0], [842, 595, 90], [595, 842, 180]] as const) {
      await render(<TableEditOverlay {...props([table()])} pageWidthPts={w} pageHeightPts={h} rotation={rotation} />);
      const box = document.querySelector("button[aria-pressed]") as HTMLElement;
      expect(box.style.left).toBe("120px");
      expect(box.style.top).toBe("284px");
      act(() => root!.unmount());
      el!.remove();
    }
  });
});

describe("table toolbar", () => {
  it("an engine table keeps its edit buttons and also offers copy/export", async () => {
    await render(<TableEditOverlay {...props([table({ source: "model", editable: true })], { onExport: vi.fn() })} />);
    expect(byLabel("Insert row above")).toBeTruthy();
    expect(byLabel("Copy or export table")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Read-only table");
  });

  it("a table read from ruling lines is read-only: no edit buttons, export still there", async () => {
    await render(<TableEditOverlay {...props([table({ source: "rules", editable: false })], { onExport: vi.fn() })} />);
    expect(byLabel("Insert row above")).toBeNull();
    expect(byLabel("Delete row")).toBeNull();
    expect(document.body.textContent).toContain("Read-only table");
    expect(byLabel("Copy or export table")).toBeTruthy();
  });

  it("the menu offers CSV, Markdown, TSV (copy) and Excel (download) and reports the choice", async () => {
    const onExport = vi.fn();
    await render(<TableEditOverlay {...props([table({ tableIndexOnPage: 3 })], { selectedTableIndex: 3, onExport })} />);
    for (const [label, format] of [
      ["Copy as CSV", "csv"],
      ["Copy as Markdown", "markdown"],
      ["Copy as TSV", "tsv"],
      ["Download as Excel (.xlsx)", "xlsx"],
    ] as const) {
      await act(async () => byLabel("Copy or export table")!.click());
      const item = [...document.querySelectorAll('[role="menuitem"]')].find((n) => n.textContent === label) as HTMLElement;
      expect(item, label).toBeTruthy();
      await act(async () => item.click());
      expect(onExport).toHaveBeenLastCalledWith(3, format);
      expect(document.querySelector('[role="menu"]')).toBeNull(); // closes after a choice
    }
    expect(onExport).toHaveBeenCalledTimes(4);
  });
});
