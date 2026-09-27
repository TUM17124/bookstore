"use client";

/**
 * page-slot.tsx
 *
 * One virtualised page in the continuous (Word-like) scroller. The slot is an
 * absolutely-positioned, *fixed-size* box (its top/height/width come from the
 * `computePageLayout` slot, so the scroll content never shifts as pages mount
 * or unmount). Inside it sits a {@link PageChrome} sheet.
 *
 * Mounting strategy (the heart of the windowing):
 *   - visible pages → keep a {@link PageCanvasHost} bitmap mounted;
 *   - active page → layer the full embedded {@link EditorCanvas} over its
 *     bitmap, revealing it only after its editable background and elements load.
 *   - off-window → render a lightweight placeholder (the server thumbnail if we
 *     have one, otherwise a sized skeleton). Zero canvas, zero Fabric — pure DOM.
 *
 * Because the box is pre-sized and the active bitmap stays in place during
 * hydration, page focus changes cause neither layout shifts nor white flashes.
 */

import React, { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import type {
  PageObject,
  Element,
  Bounds,
  Tool,
  TextStyle,
  ShapeType,
  AnnotationType,
  FieldCreationKind,
  FormFieldElement,
  TextElement,
} from "@giga-pdf/types";
import { PageChrome } from "./page-chrome";
import { PageCanvasHost } from "./page-canvas-host";
import { EditorCanvas, type EditorCanvasHandle } from "./editor-canvas";
import { PageMarginOverlay } from "./page-margin-overlay";
import { PageRulers } from "./page-rulers";
import { effectivePagePoints } from "./lib/page-layout";
import type { PageMargins } from "./lib/page-margins";
import type { PageRenderPool } from "./lib/page-render-pool";
import type { PageSlot as PageSlotGeometry } from "./lib/page-layout";
import type { RulerUnit } from "./lib/ruler-ticks";

export interface PageSlotProps {
  /** The page to render. */
  page: PageObject;
  /** 0-based index of the page in the document (pool key + active-page key). */
  index: number;
  /** Current zoom factor (1 = 100%): page points → CSS px. */
  zoom: number;
  /** Pre-computed vertical slot geometry (top / height / width in CSS px). */
  slot: PageSlotGeometry;
  /** Whether this page is inside the virtualisation window (mount a canvas). */
  isVisible: boolean;
  /** Whether this page is the active/focused one (editable EditorCanvas + ring). */
  isActive: boolean;
  /** Shared canvas + background-render pool. */
  pool: PageRenderPool;
  /**
   * Background revision for THIS page. Bumped by the continuous view when this
   * page's content was re-baked, forcing the inactive bitmap to re-rasterise
   * against the pool's new bytes. Unchanged → the existing bitmap is kept. The
   * active page renders an EditorCanvas, so it ignores this.
   */
  bgRevision?: number;
  /** Document ID (session backend) — forwarded to the active page's EditorCanvas. */
  documentId?: string | null;
  /** Active tool — forwarded to the active page's EditorCanvas (create/select/…). */
  tool?: Tool;
  /** Show the rulers (active page only). */
  showRulers?: boolean;
  /** Ruler display unit. */
  rulerUnit?: RulerUnit;
  /**
   * SL2 — Word-like header/footer edit mode is active. Forwarded to the active
   * page's EditorCanvas so its background raster excludes the baked `/GPHF` band
   * (the editable HeaderFooterZone is overlaid via `renderActiveOverlay`).
   */
  headerFooterActive?: boolean;
  /**
   * Remplir & Signer actif — forwarded to the active page's EditorCanvas
   * (simple clic = curseur dans un champ, clic signature = dialog de capture).
   */
  fillSignActive?: boolean;
  /** Remplir & Signer : clic sur un widget SIGNATURE (forwarded). */
  onSignatureFieldClick?: (element: FormFieldElement) => void;
  /**
   * This page's margins (PDF points), or `null` if unknown / not loaded yet.
   * Draggable margin guides render only when present AND the page is active.
   */
  margins?: PageMargins | null;
  /** Commit new margins (PDF points) for THIS page after a guide is dropped. */
  onMarginsCommit?: (index: number, margins: PageMargins) => void;
  /** Click into the page body → caller sets the active page. */
  onActivate?: (index: number) => void;
  /**
   * Resolves the registered FontFace name for an embedded PDF font, forwarded to
   * the active page's EditorCanvas so the continuous view resolves embedded
   * fonts exactly like the single-page editor.
   */
  getFontFaceName?: (
    originalName: string,
    wantVariant?: { bold?: boolean; italic?: boolean },
    text?: string,
    fontId?: string,
  ) => { name: string; embedded: boolean; exact: boolean } | null;
  /** True while embedded fonts load — forwarded to the active page's EditorCanvas
   *  so it re-renders the overlay once when fonts become ready. */
  fontsLoading?: boolean;
  /** Forwarded to the active page's EditorCanvas: shape-tool variant. */
  shapeType?: ShapeType;
  /** Forwarded to the active page's EditorCanvas: annotation-tool variant. */
  annotationType?: AnnotationType;
  /** Forwarded to the active page's EditorCanvas: form-field creation variant. */
  fieldKind?: FieldCreationKind;
  /** Forwarded to the active page's EditorCanvas: stroke colour for new shapes/annotations. */
  strokeColor?: string;
  /** Forwarded to the active page's EditorCanvas: fill colour for new shapes. */
  fillColor?: string;
  /** Forwarded to the active page's EditorCanvas: stroke width for new shapes/annotations. */
  strokeWidth?: number;
  /** Pending table placement request forwarded to the ACTIVE EditorCanvas. */
  tablePlacement?: { rows: number; cols: number } | null;
  /** Completion callback for click-drag table placement. */
  onTablePlaced?: (
    rows: number,
    cols: number,
    area: Bounds,
    pageIndex: number,
  ) => void;
  /** Forwarded to the active page's EditorCanvas: hyperlink click. */
  onHyperlinkClick?: (linkUrl?: string | null, linkPage?: number | null) => void;
  /** Forwarded to the active page's EditorCanvas: live redaction-marker count. */
  onRedactionMarksChanged?: (count: number) => void;
  /** Element created on this active page, with its 0-based page index. */
  onElementAdded?: (element: Element, pageIndex?: number) => void;
  onTextOverflow?: (
    continuations: TextElement[],
    pageIndex: number,
  ) => Promise<boolean> | void;
  /** Element to place the caret in after text flows onto this page. */
  resumeTextEditId?: string | null;
  /** Forwarded to the active page's EditorCanvas: freehand pencil stroke (PDF pts). */
  onInkDrawn?: (points: number[]) => void;
  /** Forwarded to the active page's EditorCanvas: element moved/resized/retyped. */
  onElementModified?: (element: Element, oldBounds?: Bounds) => void;
  /** Forwarded to the active page's EditorCanvas: z-order change (bring/send). */
  onElementReordered?: (element: Element, toFront: boolean) => void;
  /** Forwarded to the active page's EditorCanvas: element removed. */
  onElementRemoved?: (elementId: string) => void;
  /** Forwarded to the active page's EditorCanvas: selection changed. */
  onSelectionChanged?: (elementIds: string[]) => void;
  /**
   * Forwarded to the active page's EditorCanvas: live character-selection style
   * (Word-like partial formatting) → drives the formatting toolbar state.
   */
  onTextSelectionStyleChanged?: (style: Partial<TextStyle> | null) => void;
  /**
   * Forwarded to the active page's EditorCanvas: the imperative handle. Routing
   * this to page.tsx's `setCanvasHandle` makes the toolbar (delete/undo/redo/
   * duplicate/format/addImage) drive the ACTIVE page automatically.
   */
  onCanvasReady?: (handle: EditorCanvasHandle) => void;
  /** Forwarded to EditorCanvas for a visible page-hydration indicator. */
  onPageLoadingChange?: (loading: boolean) => void;
  /** Forwarded to the (inactive) canvas host once the page finishes rendering. */
  onReady?: (index: number) => void;
  /** Forwarded to the (inactive) canvas host when it releases its pool slot. */
  onDispose?: (index: number) => void;
  /**
   * Render an extra overlay inside the ACTIVE page's sheet (absolutely positioned
   * over the canvas, in the page×zoom space). Used to surface the table-edit
   * overlay in the continuous view, mirroring the single-page `overlay` prop of
   * `EditorCanvas`. Receives the 0-based page index so the callback can scope its
   * content to this page. Returns `null` to render nothing.
   */
  renderActiveOverlay?: (index: number) => React.ReactNode;
}

/**
 * A single positioned page in the continuous scroller. Memoised: the parent
 * re-renders on every scroll/visibility change, but a slot only needs to
 * re-render when its own inputs change.
 */
function PageSlotImpl({
  page,
  index,
  zoom,
  slot,
  isVisible,
  isActive,
  pool,
  bgRevision = 0,
  documentId,
  tool,
  showRulers = false,
  rulerUnit = "mm",
  headerFooterActive = false,
  fillSignActive = false,
  onSignatureFieldClick,
  margins,
  onMarginsCommit,
  onActivate,
  getFontFaceName,
  fontsLoading,
  shapeType,
  annotationType,
  fieldKind,
  strokeColor,
  fillColor,
  strokeWidth,
  tablePlacement,
  onTablePlaced,
  onHyperlinkClick,
  onRedactionMarksChanged,
  onElementAdded,
  onTextOverflow,
  resumeTextEditId,
  onInkDrawn,
  onElementModified,
  onElementReordered,
  onElementRemoved,
  onSelectionChanged,
  onTextSelectionStyleChanged,
  onCanvasReady,
  onPageLoadingChange,
  onReady,
  onDispose,
  renderActiveOverlay,
}: PageSlotProps) {
  // Rulers + draggable margins on the active page. Gated on `showRulers` so the
  // single "Rulers & margins" toolbar toggle shows/hides both together (Word's
  // "View → Ruler"). When this page's margins are known AND committable, render
  // the unified PageMarginOverlay (rulers WITH draggable margin handles + on-
  // sheet guide lines, sharing one live state). Otherwise fall back to passive
  // rulers (ticks only). The overlay maps the engine's intrinsic (un-rotated)
  // margins to/from screen space using the page rotation, so it works at any
  // /Rotate.
  const showPageRulers = isActive && showRulers;
  const [editorLoading, setEditorLoading] = useState(isActive);
  const handleEditorLoadingChange = useCallback(
    (loading: boolean) => {
      setEditorLoading(loading);
      onPageLoadingChange?.(loading);
    },
    [onPageLoadingChange],
  );
  // Rulers anchor to the active page; convert its rotated box to displayed points.
  const pts = effectivePagePoints(page);

  return (
    <div
      className="absolute left-0 right-0 flex justify-center"
      style={{ top: slot.top, height: slot.height }}
      data-page-index={index}
      onMouseDown={onActivate ? () => onActivate(index) : undefined}
    >
      <PageChrome
        width={slot.width}
        height={slot.height}
        pageNumber={page.pageNumber}
        active={isActive}
      >
        {isVisible ? (
          // Keep the read-only bitmap mounted beneath the active editor. It is
          // the stable visual while Fabric fetches/rasterizes the editable page.
          <div
            className="absolute inset-0 z-0"
            style={{ pointerEvents: isActive ? "none" : undefined }}
          >
            <PageCanvasHost
              page={page}
              index={index}
              scale={zoom}
              pool={pool}
              bgRevision={bgRevision}
              {...(getFontFaceName ? { getFontFaceName } : {})}
              {...(fontsLoading !== undefined ? { fontsLoading } : {})}
              {...(onReady ? { onReady } : {})}
              {...(onDispose ? { onDispose } : {})}
            />
          </div>
        ) : null}
        {isActive ? (
          <div className="absolute inset-0 z-10">
            <EditorCanvas
              embedded
              page={page}
              documentId={documentId}
              zoom={zoom}
              width={slot.width}
              height={slot.height}
              tool={tool ?? "select"}
              pageIndex={index}
              headerFooterActive={headerFooterActive}
              fillSignActive={fillSignActive}
              {...(onSignatureFieldClick ? { onSignatureFieldClick } : {})}
              {...(getFontFaceName ? { getFontFaceName } : {})}
              {...(fontsLoading !== undefined ? { fontsLoading } : {})}
              {...(shapeType !== undefined ? { shapeType } : {})}
              {...(annotationType !== undefined ? { annotationType } : {})}
              {...(fieldKind !== undefined ? { fieldKind } : {})}
              {...(strokeColor !== undefined ? { strokeColor } : {})}
              {...(fillColor !== undefined ? { fillColor } : {})}
              {...(strokeWidth !== undefined ? { strokeWidth } : {})}
              {...(tablePlacement !== undefined ? { tablePlacement } : {})}
              {...(onTablePlaced ? { onTablePlaced } : {})}
              {...(onHyperlinkClick ? { onHyperlinkClick } : {})}
              {...(onRedactionMarksChanged ? { onRedactionMarksChanged } : {})}
              {...(onElementAdded ? { onElementAdded } : {})}
              {...(onTextOverflow ? { onTextOverflow } : {})}
              {...(resumeTextEditId ? { resumeTextEditId } : {})}
              {...(onInkDrawn ? { onInkDrawn } : {})}
              {...(onElementModified ? { onElementModified } : {})}
              {...(onElementReordered ? { onElementReordered } : {})}
              {...(onElementRemoved ? { onElementRemoved } : {})}
              {...(onSelectionChanged ? { onSelectionChanged } : {})}
              {...(onTextSelectionStyleChanged
                ? { onTextSelectionStyleChanged }
                : {})}
              {...(onCanvasReady ? { onCanvasReady } : {})}
              onPageLoadingChange={handleEditorLoadingChange}
            />
          </div>
        ) : !isVisible ? (
          <PageSlotPlaceholder
            thumbnailUrl={page.preview?.thumbnailUrl ?? null}
            width={slot.width}
            height={slot.height}
            pageNumber={page.pageNumber}
          />
        ) : null}
        {isActive && editorLoading ? (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-2 bg-white/35 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading page…
          </div>
        ) : null}
        {showPageRulers && margins != null && onMarginsCommit ? (
          <PageMarginOverlay
            width={slot.width}
            height={slot.height}
            zoom={zoom}
            unit={rulerUnit}
            margins={margins}
            rotation={page.dimensions.rotation}
            onCommit={(m) => onMarginsCommit(index, m)}
          />
        ) : showPageRulers ? (
          <PageRulers
            pageWidthPts={pts.w}
            pageHeightPts={pts.h}
            zoom={zoom}
            unit={rulerUnit}
          />
        ) : null}
        {isActive && renderActiveOverlay ? renderActiveOverlay(index) : null}
      </PageChrome>
    </div>
  );
}

export const PageSlot = React.memo(PageSlotImpl);

interface PageSlotPlaceholderProps {
  thumbnailUrl: string | null;
  width: number;
  height: number;
  pageNumber: number;
}

/**
 * Off-window stand-in: a server thumbnail scaled to the slot, or a neutral
 * skeleton. Always fills the (pre-sized) sheet, so no layout shift on swap.
 */
function PageSlotPlaceholder({
  thumbnailUrl,
  width,
  height,
  pageNumber,
}: PageSlotPlaceholderProps) {
  if (thumbnailUrl) {
    // Ephemeral page preview (data: URL or signed S3 URL), not a static asset —
    // next/image would add no value and break on opaque/remote sources.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbnailUrl}
        alt={`Page ${pageNumber}`}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        draggable={false}
        style={{ width, height, display: "block", objectFit: "fill" }}
      />
    );
  }

  return (
    <div
      className="h-full w-full animate-pulse bg-gray-100"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
