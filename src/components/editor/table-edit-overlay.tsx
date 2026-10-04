"use client";

/**
 * table-edit-overlay.tsx
 *
 * The Word-like table-editing layer: a per-page overlay that draws a selectable
 * rectangle over every table the service found (frames come from
 * `/api/pdf/table-structure` in displayed page space, origin top-left), and a small
 * floating toolbar — appearing above the selected table — to add / remove a row
 * or column. Each action bakes the structural edit natively through the engine
 * (`applyModelOps` with `tableOps`) and the page re-parses, so the change is real
 * (a true model edit + reload), not an overlay decoration.
 *
 * Why a POSITIONAL handle, not `source_index`. The editor's in-place text edits
 * key off a run's flat `source_index`; table CELL runs carry none (the engine
 * reconstructs a cell as a single text-only run with `source_index: null`). A
 * table is therefore selected by HIT-TESTING a click against its frame and
 * addressed by its position — `(pageNumber, tableIndexOnPage)` — which the bake
 * resolves back to the table block. Geometry is the only viable seam here.
 *
 * Coordinate model
 * ────────────────
 * Frames are already in DISPLAYED page space: points, origin top-left (Y-down),
 * page rotation applied (the engine's model frames and the service's ruled-table
 * frames both use it). The sheet renders at `zoom` (1pt → 1px at zoom 1), so
 * `px = pt * zoom` - no flip. (This used to flip them again as if they were PDF
 * user space, which drew every overlay mirrored vertically.) The overlay fills the page
 * sheet absolutely; only the table rectangles + toolbar are pointer-interactive
 * (the rest is `pointer-events-none`), so it never steals clicks from the page.
 */

import React, { useMemo, useState } from "react";
import { useTranslations } from "@/lib/pdf-editor/use-translations";
import {
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  Trash2,
  Combine,
  PaintBucket,
  ChevronDown,
  Copy,
  Download,
} from "lucide-react";
import type { TableStructureInfo } from "@giga-pdf/api";
import type { TableExportFormat } from "@/lib/table-export";

/** Which add/remove action a toolbar button triggers, in grid terms. */
export type TableEditAction =
  | "insertRowAbove"
  | "insertRowBelow"
  | "insertColumnLeft"
  | "insertColumnRight"
  | "deleteRow"
  | "deleteColumn";

/**
 * A table STYLE action carrying its value(s). Distinct from the grid
 * {@link TableEditAction} (which is a bare string resolved positionally): each
 * style action targets a specific cell/row/column/table and carries the new
 * value, so it maps directly to a `setCellShading` / `setRowHeight` /
 * `setColWidth` / `setTableBorder` / `setCellSpan` bake.
 */
export type TableStyleAction =
  | {
      kind: "setCellShading";
      /** 0-based cell row in `rows`. */
      row: number;
      /** 0-based cell index in `rows[row].cells`. */
      col: number;
      /** RGB `0..1` shading, or `null` to clear it. */
      color: [number, number, number] | null;
    }
  | { kind: "setRowHeight"; row: number; height: number }
  | { kind: "setColWidth"; col: number; width: number }
  | {
      kind: "setTableBorder";
      border: { width: number; color: [number, number, number] };
    }
  | {
      kind: "setCellSpan";
      row: number;
      col: number;
      colSpan: number;
      rowSpan: number;
    };

export interface TableEditOverlayProps {
  /** Tables on THIS page (already filtered to `pageNumber`), in reading order. */
  tables: TableStructureInfo[];
  /** Page width in PDF points (kept for callers; frames no longer need it). */
  pageWidthPts?: number;
  /** Page height in PDF points (kept for callers; frames no longer need it). */
  pageHeightPts?: number;
  /** Page `/Rotate` (kept for callers; frames are already in displayed space). */
  rotation?: 0 | 90 | 180 | 270;
  /** Current zoom factor (1 = 100%): points → px. */
  zoom: number;
  /** The selected table's `tableIndexOnPage`, or `null` when none is selected. */
  selectedTableIndex: number | null;
  /**
   * The active cell within the selected table (`row`/`col`), when a cell was
   * resolved (e.g. a cell's text was clicked) — drives precise insertion + shows
   * a hint on the toolbar. `null` ⇒ the table is selected by its frame only and
   * actions act on the table's edges.
   */
  activeCell: { row: number; col: number } | null;
  /** Select (or, with `null`, clear) a table by its `tableIndexOnPage`. */
  onSelectTable: (tableIndexOnPage: number | null) => void;
  /** Run an add/remove action on the selected table. */
  onAction: (tableIndexOnPage: number, action: TableEditAction) => void;
  /** Run a STYLE action (cell shading, row/col size, border, span) on a table. */
  onStyleAction: (tableIndexOnPage: number, action: TableStyleAction) => void;
  /** Copy (CSV / Markdown / TSV) or download (Excel) a table. */
  onExport?: (tableIndexOnPage: number, format: TableExportFormat) => void;
  /** Disables the toolbar buttons while a bake is in flight. */
  busy?: boolean;
}

/** A table's on-screen rectangle (CSS px within the displayed sheet). */
interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * A table frame (displayed page space, points, origin top-left) as a rectangle
 * in CSS px on the page sheet. Returns `null` when the table has no frame.
 */
export function frameToScreenRect(
  frame: TableStructureInfo["frame"],
  zoom: number,
): ScreenRect | null {
  if (!frame) return null;
  return {
    left: frame.x * zoom,
    top: frame.y * zoom,
    width: frame.w * zoom,
    height: frame.h * zoom,
  };
}

/** One add/remove toolbar button (icon + accessible label + handler). */
function ToolbarButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

/** Default stroke colour (black) used when first setting a table border. */
const DEFAULT_BORDER_COLOR = "#000000";
/** Default cell shading colour offered by the picker (light yellow). */
const DEFAULT_SHADE_COLOR = "#fff2a8";

/** Parse a `#rrggbb` hex string to an RGB `0..1` triple (engine colour space). */
function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m?.[1]) return [0, 0, 0];
  const n = Number.parseInt(m[1], 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/**
 * The table STYLE popover: merge cells, cell shading, row height, column width
 * and table border. Cell-scoped controls (merge, shading, row height, column
 * width) require an `activeCell`; the table border always applies. Each control
 * fires `onStyleAction`, which bakes the matching model op and re-parses.
 */
function TableStyleMenu({
  tableIndexOnPage,
  activeCell,
  colCount,
  onStyleAction,
  busy,
}: {
  tableIndexOnPage: number;
  activeCell: { row: number; col: number } | null;
  colCount: number;
  onStyleAction: (tableIndexOnPage: number, action: TableStyleAction) => void;
  busy: boolean;
}) {
  const t = useTranslations("editor.tableEdit");
  const [open, setOpen] = useState(false);
  const [borderWidth, setBorderWidth] = useState(1);
  const [borderColor, setBorderColor] = useState(DEFAULT_BORDER_COLOR);
  const [rowHeight, setRowHeight] = useState(20);
  const [colWidth, setColWidth] = useState(80);

  const fire = (action: TableStyleAction) =>
    onStyleAction(tableIndexOnPage, action);

  // Merge needs a cell AND a right-hand neighbour to span into.
  const canMerge = activeCell != null && activeCell.col < colCount - 1;
  const cellDisabled = busy || activeCell == null;

  return (
    <div
      className="relative"
      // Keep the menu open while interacting; closing is by the toggle / blur.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title={t("tableStyle")}
        aria-label={t("tableStyle")}
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="flex h-7 items-center justify-center gap-0.5 rounded px-1 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        <PaintBucket size={15} />
        <ChevronDown size={11} />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-1 w-60 rounded-lg border border-border bg-background p-2 shadow-xl">
          {/* Merge cells (active cell + right neighbour → colSpan 2) */}
          <button
            type="button"
            disabled={!canMerge}
            onClick={() => {
              if (!activeCell) return;
              fire({
                kind: "setCellSpan",
                row: activeCell.row,
                col: activeCell.col,
                colSpan: 2,
                rowSpan: 1,
              });
            }}
            className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Combine size={14} />
            {t("mergeCells")}
          </button>

          {/* Cell shading — colour picker + clear (cell-scoped) */}
          <div className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
            <span className="text-muted-foreground">{t("cellShading")}</span>
            <span className="flex items-center gap-1">
              <input
                type="color"
                defaultValue={DEFAULT_SHADE_COLOR}
                disabled={cellDisabled}
                onChange={(e) => {
                  if (!activeCell) return;
                  fire({
                    kind: "setCellShading",
                    row: activeCell.row,
                    col: activeCell.col,
                    color: hexToRgb01(e.target.value),
                  });
                }}
                className="h-7 w-9 cursor-pointer rounded border bg-background disabled:cursor-not-allowed disabled:opacity-40"
              />
              <button
                type="button"
                title={t("cellShadingClear")}
                disabled={cellDisabled}
                onClick={() => {
                  if (!activeCell) return;
                  fire({
                    kind: "setCellShading",
                    row: activeCell.row,
                    col: activeCell.col,
                    color: null,
                  });
                }}
                className="rounded border px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                ×
              </button>
            </span>
          </div>

          {/* Row height (cell-scoped: the active cell's row) */}
          <div className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
            <span className="text-muted-foreground">{t("rowHeight")}</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step={1}
                value={rowHeight}
                disabled={cellDisabled}
                onChange={(e) => {
                  const v = Number.parseFloat(e.target.value);
                  setRowHeight(Number.isFinite(v) ? Math.max(0, v) : 0);
                }}
                className="w-16 rounded border bg-background px-1.5 py-1 text-right text-foreground disabled:opacity-40"
              />
              <button
                type="button"
                disabled={cellDisabled}
                onClick={() => {
                  if (!activeCell) return;
                  fire({
                    kind: "setRowHeight",
                    row: activeCell.row,
                    height: Math.max(0, rowHeight),
                  });
                }}
                className="rounded border px-1.5 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("apply")}
              </button>
            </span>
          </div>

          {/* Column width (cell-scoped: the active cell's column) */}
          <div className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
            <span className="text-muted-foreground">{t("columnWidth")}</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step={1}
                value={colWidth}
                disabled={cellDisabled}
                onChange={(e) => {
                  const v = Number.parseFloat(e.target.value);
                  setColWidth(Number.isFinite(v) ? Math.max(0, v) : 0);
                }}
                className="w-16 rounded border bg-background px-1.5 py-1 text-right text-foreground disabled:opacity-40"
              />
              <button
                type="button"
                disabled={cellDisabled}
                onClick={() => {
                  if (!activeCell) return;
                  fire({
                    kind: "setColWidth",
                    col: activeCell.col,
                    width: Math.max(0, colWidth),
                  });
                }}
                className="rounded border px-1.5 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("apply")}
              </button>
            </span>
          </div>

          {/* Table border — width + colour (whole-table; always available) */}
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-border px-2 pt-2 text-sm">
            <span className="text-muted-foreground">{t("tableBorder")}</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step={0.5}
                value={borderWidth}
                disabled={busy}
                onChange={(e) => {
                  const v = Number.parseFloat(e.target.value);
                  setBorderWidth(Number.isFinite(v) ? Math.max(0, v) : 0);
                }}
                className="w-14 rounded border bg-background px-1.5 py-1 text-right text-foreground disabled:opacity-40"
              />
              <input
                type="color"
                value={borderColor}
                disabled={busy}
                onChange={(e) => setBorderColor(e.target.value)}
                className="h-7 w-9 cursor-pointer rounded border bg-background disabled:opacity-40"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  fire({
                    kind: "setTableBorder",
                    border: {
                      width: Math.max(0, borderWidth),
                      color: hexToRgb01(borderColor),
                    },
                  })
                }
                className="rounded border px-1.5 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("apply")}
              </button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Copy / export menu: CSV, Markdown and TSV go to the clipboard, Excel downloads a file. */
function TableExportMenu({
  onExport,
  busy,
}: {
  onExport: (format: TableExportFormat) => void;
  busy: boolean;
}) {
  const t = useTranslations("editor.tableEdit");
  const [open, setOpen] = useState(false);
  const items: Array<{ format: TableExportFormat; label: string; icon: React.ReactNode }> = [
    { format: "csv", label: t("copyCsv"), icon: <Copy size={14} /> },
    { format: "markdown", label: t("copyMarkdown"), icon: <Copy size={14} /> },
    { format: "tsv", label: t("copyTsv"), icon: <Copy size={14} /> },
    { format: "xlsx", label: t("downloadXlsx"), icon: <Download size={14} /> },
  ];
  return (
    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        title={t("exportMenu")}
        aria-label={t("exportMenu")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="flex h-7 items-center justify-center gap-0.5 rounded px-1 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Copy size={15} />
        <ChevronDown size={11} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-1 w-56 rounded-lg border border-border bg-background p-1 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.format}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExport(item.format);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The floating add/remove toolbar, positioned just above a table's screen rect
 * (or below it when the table starts near the top of the sheet so the toolbar
 * stays visible). Pointer-interactive.
 */
function TableToolbar({
  rect,
  tableIndexOnPage,
  colCount,
  canDeleteRow,
  canDeleteColumn,
  activeCell,
  editable,
  onAction,
  onStyleAction,
  onExport,
  busy,
}: {
  rect: ScreenRect;
  tableIndexOnPage: number;
  colCount: number;
  canDeleteRow: boolean;
  canDeleteColumn: boolean;
  activeCell: { row: number; col: number } | null;
  /** False for tables read from ruling lines: copy/export only. */
  editable: boolean;
  onAction: (tableIndexOnPage: number, action: TableEditAction) => void;
  onStyleAction: (tableIndexOnPage: number, action: TableStyleAction) => void;
  onExport?: (tableIndexOnPage: number, format: TableExportFormat) => void;
  busy: boolean;
}) {
  const t = useTranslations("editor.tableEdit");
  const TOOLBAR_HEIGHT = 36; // approx; used to decide above/below placement
  const placeBelow = rect.top < TOOLBAR_HEIGHT + 8;
  const top = placeBelow ? rect.top + rect.height + 6 : rect.top - TOOLBAR_HEIGHT - 6;

  const run = (action: TableEditAction) => () =>
    onAction(tableIndexOnPage, action);

  // When a cell is active the actions act AT that cell (precise); otherwise on
  // the table edges. Surface that in each button's title so the behaviour is
  // discoverable (e.g. "Insert row above (row 2)").
  const at = activeCell
    ? { r: activeCell.row + 1, c: activeCell.col + 1 }
    : null;
  const label = (key: string) =>
    at ? `${t(key)} — ${t("atCell", { row: at.r, col: at.c })}` : t(key);

  return (
    <div
      className="pointer-events-auto absolute z-30 flex items-center gap-0.5 rounded-lg border border-border bg-background p-1 shadow-lg"
      style={{ left: rect.left, top }}
      // Prevent the page-body deselect handler from firing when using the bar.
      onMouseDown={(e) => e.stopPropagation()}
    >
      {editable ? (
        <>
      <ToolbarButton label={label("insertRowAbove")} onClick={run("insertRowAbove")} disabled={busy}>
        <ArrowUpToLine size={15} />
      </ToolbarButton>
      <ToolbarButton label={label("insertRowBelow")} onClick={run("insertRowBelow")} disabled={busy}>
        <ArrowDownToLine size={15} />
      </ToolbarButton>
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <ToolbarButton
        label={label("insertColumnLeft")}
        onClick={run("insertColumnLeft")}
        disabled={busy}
      >
        <ArrowLeftToLine size={15} />
      </ToolbarButton>
      <ToolbarButton
        label={label("insertColumnRight")}
        onClick={run("insertColumnRight")}
        disabled={busy}
      >
        <ArrowRightToLine size={15} />
      </ToolbarButton>
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <ToolbarButton
        label={label("deleteRow")}
        onClick={run("deleteRow")}
        disabled={busy || !canDeleteRow}
        danger
      >
        <span className="relative flex items-center">
          <Trash2 size={15} />
        </span>
      </ToolbarButton>
      <ToolbarButton
        label={label("deleteColumn")}
        onClick={run("deleteColumn")}
        disabled={busy || !canDeleteColumn}
        danger
      >
        <ArrowRightToLine size={15} className="rotate-90" />
      </ToolbarButton>
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <TableStyleMenu
        tableIndexOnPage={tableIndexOnPage}
        activeCell={activeCell}
        colCount={colCount}
        onStyleAction={onStyleAction}
        busy={busy}
      />
        </>
      ) : (
        <span className="px-2 text-xs text-muted-foreground" title={t("readOnlyHint")}>
          {t("readOnly")}
        </span>
      )}
      {onExport ? (
        <>
          {editable ? <span className="mx-0.5 h-5 w-px bg-border" aria-hidden /> : null}
          <TableExportMenu
            onExport={(format) => onExport(tableIndexOnPage, format)}
            busy={busy}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * The table-editing overlay: a selectable rectangle per reconstructed table plus
 * the floating add/remove toolbar for the selected one. Renders nothing useful
 * when no table on the page has a frame (the rectangles are skipped).
 */
export function TableEditOverlay({
  tables,
  zoom,
  selectedTableIndex,
  activeCell,
  onSelectTable,
  onAction,
  onStyleAction,
  onExport,
  busy = false,
}: TableEditOverlayProps) {
  const t = useTranslations("editor.tableEdit");

  // Precompute each table's screen rect once per geometry change.
  const rects = useMemo(
    () =>
      tables.map((table) => ({
        table,
        rect: frameToScreenRect(table.frame, zoom),
      })),
    [tables, zoom],
  );

  const selected = rects.find(
    (r) => r.table.tableIndexOnPage === selectedTableIndex && r.rect !== null,
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {rects.map(({ table, rect }) => {
        if (!rect) return null;
        const isSelected = table.tableIndexOnPage === selectedTableIndex;
        const hitWidth = Math.max(rect.width, 40);
        const hitHeight = Math.max(rect.height, 40);
        return (
          <button
            key={table.tableIndexOnPage}
            type="button"
            aria-label={t("selectTable", {
              rows: table.rowCount,
              cols: table.colCount,
            })}
            aria-pressed={isSelected}
            onMouseDown={(e) => {
              // Claim the click so the page body doesn't deselect underneath.
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              onSelectTable(isSelected ? null : table.tableIndexOnPage)
            }
            className="group pointer-events-auto absolute touch-manipulation rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{
              left: rect.left - (hitWidth - rect.width) / 2,
              top: rect.top - (hitHeight - rect.height) / 2,
              width: hitWidth,
              height: hitHeight,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute rounded-sm transition-[background-color,border-color,box-shadow] ${
                isSelected
                  ? "z-10 border-[3px] border-primary bg-primary/15 shadow-lg ring-2 ring-primary/40 ring-offset-1"
                  : "border-2 border-dashed border-primary/60 bg-primary/5 group-hover:border-primary group-hover:bg-primary/10"
              }`}
              style={{
                left: (hitWidth - rect.width) / 2,
                top: (hitHeight - rect.height) / 2,
                width: rect.width,
                height: rect.height,
              }}
            />
          </button>
        );
      })}

      {selected && selected.rect ? (
        <TableToolbar
          rect={selected.rect}
          tableIndexOnPage={selected.table.tableIndexOnPage}
          colCount={selected.table.colCount}
          canDeleteRow={selected.table.rowCount > 1}
          canDeleteColumn={selected.table.colCount > 1}
          activeCell={activeCell}
          editable={selected.table.editable !== false}
          onAction={onAction}
          onStyleAction={onStyleAction}
          {...(onExport ? { onExport } : {})}
          busy={busy}
        />
      ) : null}
    </div>
  );
}
