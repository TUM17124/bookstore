"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  Loader2,
  AlertCircle,
  ScanSearch,
  Type,
  Image as ImageIcon,
  Trash2,
  RotateCcw,
  X,
  SquareDashedMousePointer,
  Undo2,
  Square,
  MessageSquare,
  FormInput,
  Move,
} from "lucide-react";
import { useOpenPdf } from "@giga-pdf/api";
import type { TextElement, ImageElement, ShapeElement, AnnotationElement, FormFieldElement } from "@giga-pdf/types";
import { cn } from "@/lib/pdf-editor/utils";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ElementModification {
  action: "update" | "delete";
  pageNumber: number;
  element: Record<string, unknown>;
  oldBounds: { x: number; y: number; width: number; height: number };
}

/**
 * Backward-compatible props for the composed {@link ContentEditLayer}. Kept for
 * the embed editor (apps/web/src/app/(app)/embed) which mounts the layer as a
 * single `<main>`-cover sibling. The main editor uses the split
 * {@link ContentEditProvider} + {@link ContentEditToolbar} + {@link ContentEditZones}
 * so the same deep-edit surface works in the continuous (Word-like) view.
 */
export interface ContentEditLayerProps {
  /** The current PDF file to analyze */
  currentFile: File | null;
  /** Current page number (0-indexed) */
  currentPageIndex: number;
  /** Current zoom level */
  zoom: number;
  /** Whether content edit mode is active */
  isActive: boolean;
  /** Callback when modifications change */
  onModificationsChange: (modifications: ElementModification[]) => void;
  /** Reference to the rendered PDF canvas for background sampling */
  canvasRef?: React.RefObject<HTMLCanvasElement>;
}

// ─── Internal Types ───────────────────────────────────────────────────────────

type ParsedElement = TextElement | ImageElement | ShapeElement | AnnotationElement | FormFieldElement;

interface ZoneState {
  /** elementId → modification */
  modifications: Map<string, ElementModification>;
  /** elementId currently open for text editing */
  activeEditId: string | null;
  /** current textarea value while editing */
  editValue: string;
  /** elementId hovered */
  hoveredZoneId: string | null;
  /** selected box — shows resize handles */
  selectedId: string | null;
  /** elementId with image replacement preview dataUrl */
  imagePreviewMap: Map<string, string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isTextElement(el: ParsedElement): el is TextElement {
  return el.type === "text";
}

function isImageElement(el: ParsedElement): el is ImageElement {
  return el.type === "image";
}

function isShapeElement(el: ParsedElement): el is ShapeElement {
  return el.type === "shape";
}

function isAnnotationElement(el: ParsedElement): el is AnnotationElement {
  return el.type === "annotation";
}

function isFormFieldElement(el: ParsedElement): el is FormFieldElement {
  return el.type === "form_field";
}

/** Read a File as a base64 data URL */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function elementLabel(el: ParsedElement): string {
  if (isTextElement(el)) {
    const preview = el.content.slice(0, 32);
    return preview.length < el.content.length ? `${preview}…` : preview;
  }
  if (isImageElement(el)) {
    return `Image (${Math.round(el.bounds.width)}×${Math.round(el.bounds.height)} pt)`;
  }
  if (isShapeElement(el)) {
    return `Shape: ${el.shapeType}`;
  }
  if (isAnnotationElement(el)) {
    return `Annotation: ${el.annotationType}`;
  }
  if (isFormFieldElement(el)) {
    return `Form: ${el.fieldType} — ${el.fieldName}`;
  }
  return "Unknown element";
}

/**
 * Capture a rectangular region from a canvas as a data URL.
 * Used to sample the background behind text zones so the inline editor
 * can display the real page background instead of a plain white overlay.
 * Falls back to null if the canvas is tainted or the region is invalid.
 */
function captureCanvasRegion(
  canvas: HTMLCanvasElement,
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
): string | null {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // The bounds are in PDF points scaled by zoom; the canvas may have a
    // different pixel ratio (e.g. devicePixelRatio backing store).
    const canvasScale = canvas.width / (canvas.clientWidth || 1);

    const x = Math.max(0, Math.floor(bounds.x * zoom * canvasScale));
    const y = Math.max(0, Math.floor(bounds.y * zoom * canvasScale));
    const w = Math.min(
      canvas.width - x,
      Math.ceil(bounds.width * zoom * canvasScale),
    );
    const h = Math.min(
      canvas.height - y,
      Math.ceil(bounds.height * zoom * canvasScale),
    );

    if (w <= 0 || h <= 0) return null;

    const imageData = ctx.getImageData(x, y, w, h);

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = w;
    tmpCanvas.height = h;
    const tmpCtx = tmpCanvas.getContext("2d");
    if (!tmpCtx) return null;
    tmpCtx.putImageData(imageData, 0, 0);

    return tmpCanvas.toDataURL("image/png");
  } catch {
    // Canvas may be tainted (cross-origin) — fall back gracefully
    return null;
  }
}


type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

const MIN_ZONE_W = 24;
const MIN_ZONE_H = 16;

function boundsFromMod(
  element: ParsedElement,
  mod?: ElementModification,
): { x: number; y: number; width: number; height: number } {
  const next = mod?.element as
    | { bounds?: { x: number; y: number; width: number; height: number } }
    | undefined;
  return next?.bounds ?? element.bounds;
}

function applyResizeDelta(
  start: { x: number; y: number; width: number; height: number },
  handle: ResizeHandle,
  dx: number,
  dy: number,
): { x: number; y: number; width: number; height: number } {
  let { x, y, width, height } = start;

  if (handle === "move") {
    return { x: x + dx, y: y + dy, width, height };
  }
  if (handle.includes("e")) width = start.width + dx;
  if (handle.includes("s")) height = start.height + dy;
  if (handle.includes("w")) {
    width = start.width - dx;
    x = start.x + dx;
  }
  if (handle.includes("n")) {
    height = start.height - dy;
    y = start.y + dy;
  }
  if (width < MIN_ZONE_W) {
    if (handle.includes("w")) x = start.x + start.width - MIN_ZONE_W;
    width = MIN_ZONE_W;
  }
  if (height < MIN_ZONE_H) {
    if (handle.includes("n")) y = start.y + start.height - MIN_ZONE_H;
    height = MIN_ZONE_H;
  }
  return { x, y, width, height };
}

const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
  move: "move",
};

function ZoneResizeFrame({
  zoom,
  selected,
  box,
  onSelect,
  onEdit,
  onBoundsChange,
  children,
}: {
  zoom: number;
  selected: boolean;
  box: { x: number; y: number; width: number; height: number };
  onSelect: () => void;
  onEdit: () => void;
  onBoundsChange: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  children?: React.ReactNode;
}) {
  const startRef = useRef<{
    handle: ResizeHandle;
    x: number;
    y: number;
    width: number;
    height: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);

  const beginDrag = (
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = {
      handle,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      pointerX: event.clientX,
      pointerY: event.clientY,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const start = startRef.current;
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    onBoundsChange(
      applyResizeDelta(
        {
          x: start.x,
          y: start.y,
          width: start.width,
          height: start.height,
        },
        start.handle,
        (event.clientX - start.pointerX) / zoom,
        (event.clientY - start.pointerY) / zoom,
      ),
    );
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!startRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    startRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  };

  const handles: Array<{ handle: Exclude<ResizeHandle, "move">; style: React.CSSProperties }> = [
    { handle: "nw", style: { left: -5, top: -5 } },
    { handle: "n", style: { left: "calc(50% - 5px)", top: -5 } },
    { handle: "ne", style: { right: -5, top: -5 } },
    { handle: "e", style: { right: -5, top: "calc(50% - 5px)" } },
    { handle: "se", style: { right: -5, bottom: -5 } },
    { handle: "s", style: { left: "calc(50% - 5px)", bottom: -5 } },
    { handle: "sw", style: { left: -5, bottom: -5 } },
    { handle: "w", style: { left: -5, top: "calc(50% - 5px)" } },
  ];

  return (
    <div className="absolute inset-0">
      <div
        className={cn(
          "absolute inset-0 rounded-sm border-2",
          selected
            ? "cursor-move border-blue-500 bg-blue-500/5"
            : "border-transparent hover:border-blue-400/80",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        onPointerDown={(event) => {
          if (!selected) return;
          beginDrag("move", event);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      {children}
      {selected
        ? handles.map((item) => (
            <button
              key={item.handle}
              type="button"
              aria-label={`Resize ${item.handle}`}
              className="absolute z-50 h-2.5 w-2.5 rounded-[2px] border border-blue-600 bg-white shadow-sm"
              style={{ ...item.style, cursor: HANDLE_CURSOR[item.handle] }}
              onPointerDown={(event) => beginDrag(item.handle, event)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
          ))
        : null}
      {selected ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          className="absolute -bottom-7 left-1/2 z-50 -translate-x-1/2 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white shadow"
        >
          Edit text
        </button>
      ) : null}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ZoneTooltipProps {
  element: ParsedElement;
}

function ZoneTooltip({ element }: ZoneTooltipProps) {
  if (isTextElement(element)) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute -top-8 left-0 z-50",
          "flex items-center gap-1.5 whitespace-nowrap",
          "rounded-md border border-border bg-popover px-2 py-1",
          "text-[10px] text-popover-foreground shadow-md",
        )}
      >
        <Type className="h-3 w-3 flex-shrink-0 text-blue-500" />
        <span className="font-mono">{element.style.fontFamily}</span>
        <span className="text-muted-foreground">{element.style.fontSize}pt</span>
        {element.style.fontWeight === "bold" && (
          <span className="font-bold text-muted-foreground">B</span>
        )}
        {element.style.fontStyle === "italic" && (
          <span className="italic text-muted-foreground">I</span>
        )}
      </div>
    );
  }
  if (isImageElement(element)) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute -top-8 left-0 z-50",
          "flex items-center gap-1.5 whitespace-nowrap",
          "rounded-md border border-border bg-popover px-2 py-1",
          "text-[10px] text-popover-foreground shadow-md",
        )}
      >
        <ImageIcon className="h-3 w-3 flex-shrink-0 text-green-500" />
        <span>
          {element.source.originalDimensions.width}×
          {element.source.originalDimensions.height}px
        </span>
        <span className="text-muted-foreground uppercase">
          {element.source.originalFormat}
        </span>
      </div>
    );
  }
  if (isShapeElement(element)) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute -top-8 left-0 z-50",
          "flex items-center gap-1.5 whitespace-nowrap",
          "rounded-md border border-border bg-popover px-2 py-1",
          "text-[10px] text-popover-foreground shadow-md",
        )}
      >
        <Square className="h-3 w-3 flex-shrink-0 text-purple-500" />
        <span className="capitalize">{element.shapeType}</span>
        {element.style?.strokeColor && (
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border border-border"
            style={{ backgroundColor: element.style.strokeColor }}
          />
        )}
      </div>
    );
  }
  if (isAnnotationElement(element)) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute -top-8 left-0 z-50",
          "flex items-center gap-1.5 whitespace-nowrap",
          "rounded-md border border-border bg-popover px-2 py-1",
          "text-[10px] text-popover-foreground shadow-md",
        )}
      >
        <MessageSquare className="h-3 w-3 flex-shrink-0 text-orange-500" />
        <span className="capitalize">{element.annotationType}</span>
        {element.content && (
          <span className="max-w-[120px] truncate text-muted-foreground">
            {element.content}
          </span>
        )}
      </div>
    );
  }
  if (isFormFieldElement(element)) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute -top-8 left-0 z-50",
          "flex items-center gap-1.5 whitespace-nowrap",
          "rounded-md border border-border bg-popover px-2 py-1",
          "text-[10px] text-popover-foreground shadow-md",
        )}
      >
        <FormInput className="h-3 w-3 flex-shrink-0 text-teal-500" />
        <span className="capitalize">{element.fieldType}</span>
        <span className="text-muted-foreground">{element.fieldName}</span>
      </div>
    );
  }
  return null;
}

// ─── Inline Text Editor ────────────────────────────────────────────────────────

interface InlineTextEditorProps {
  element: TextElement;
  zoom: number;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  /** Captured background image data URL from the canvas */
  backgroundImage: string | null;
}

function InlineTextEditor({
  element,
  zoom,
  value,
  onChange,
  onConfirm,
  onCancel,
  backgroundImage,
}: InlineTextEditorProps) {
  const { bounds, style } = element;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onConfirm();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [onConfirm, onCancel],
  );

  return (
    // Fills the per-element zone wrapper (already translated to bounds*zoom).
    // Positioning at (0,0) here — NOT bounds*zoom again — keeps a single offset
    // so the editor sits exactly on the glyph it replaces.
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: bounds.width * zoom,
        minHeight: bounds.height * zoom,
        zIndex: 40,
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onConfirm}
        onKeyDown={handleKeyDown}
        style={{
          width: "100%",
          minHeight: bounds.height * zoom,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize * zoom,
          color: style.color,
          textAlign: style.textAlign,
          lineHeight: style.lineHeight,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          letterSpacing: style.letterSpacing,
          textDecoration: [
            style.underline ? "underline" : "",
            style.strikethrough ? "line-through" : "",
          ]
            .filter(Boolean)
            .join(" "),
          background: backgroundImage
            ? `url(${backgroundImage}) no-repeat center / cover`
            : "rgba(255,255,255,0.95)",
          border: "2px solid rgb(59 130 246)",
          borderRadius: 2,
          padding: "1px 2px",
          resize: "none",
          outline: "none",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
        className="ring-2 ring-blue-500 shadow-lg"
      />
    </div>
  );
}

// ─── Image Zone ────────────────────────────────────────────────────────────────

interface ImageZoneControlsProps {
  element: ImageElement;
  zoom: number;
  previewDataUrl: string | null;
  onReplace: (file: File) => void;
  onClose: () => void;
}

function ImageZoneControls({
  element,
  zoom,
  previewDataUrl,
  onReplace,
  onClose,
}: ImageZoneControlsProps) {
  const { bounds } = element;
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    // Fills the per-element zone wrapper (already at bounds*zoom). Single offset.
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: bounds.width * zoom,
        height: bounds.height * zoom,
        zIndex: 40,
      }}
      className="flex flex-col items-center justify-center bg-black/40 backdrop-blur-[1px] rounded"
    >
      {previewDataUrl !== null && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewDataUrl}
          alt="Replacement preview"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            position: "absolute",
            inset: 0,
            borderRadius: 2,
          }}
        />
      )}
      <div className="relative z-10 flex items-center gap-1.5 bg-black/70 rounded-md px-2 py-1.5 shadow">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onReplace(file);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex items-center gap-1 text-[10px] font-medium text-white",
            "rounded px-2 py-0.5 bg-green-600 hover:bg-green-500 transition-colors",
          )}
        >
          <ImageIcon className="h-3 w-3" />
          Replace image
        </button>
        <button
          onClick={onClose}
          className="p-0.5 text-white/70 hover:text-white transition-colors"
          aria-label="Close image controls"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

interface ToolbarProps {
  modificationCount: number;
  onSelectAllText: () => void;
  onUndoLast: () => void;
  onClearAll: () => void;
  canUndo: boolean;
}

function Toolbar({
  modificationCount,
  onSelectAllText,
  onUndoLast,
  onClearAll,
  canUndo,
}: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5",
        "border-b border-blue-200 bg-blue-50/90 dark:bg-blue-950/70 dark:border-blue-800",
        "backdrop-blur-sm",
      )}
    >
      {/* Mode badge */}
      <div className="flex items-center gap-1.5 mr-1">
        <SquareDashedMousePointer className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
          Content Edit Mode
        </span>
      </div>

      <div className="h-4 w-px bg-blue-200 dark:bg-blue-700" />

      {/* Modification count */}
      <span
        className={cn(
          "text-xs font-medium tabular-nums",
          modificationCount > 0
            ? "text-amber-700 dark:text-amber-400"
            : "text-muted-foreground",
        )}
      >
        {modificationCount} modification{modificationCount !== 1 ? "s" : ""}
      </span>

      <div className="flex-1" />

      {/* Actions */}
      <button
        onClick={onSelectAllText}
        className={cn(
          "flex items-center gap-1 rounded px-2 py-0.5",
          "text-[10px] font-medium text-blue-700 dark:text-blue-300",
          "hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors",
        )}
      >
        <SquareDashedMousePointer className="h-3 w-3" />
        Select all
      </button>

      <button
        onClick={onUndoLast}
        disabled={!canUndo}
        className={cn(
          "flex items-center gap-1 rounded px-2 py-0.5",
          "text-[10px] font-medium text-blue-700 dark:text-blue-300",
          "hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        <Undo2 className="h-3 w-3" />
        Undo last
      </button>

      <button
        onClick={onClearAll}
        disabled={modificationCount === 0}
        className={cn(
          "flex items-center gap-1 rounded px-2 py-0.5",
          "text-[10px] font-medium text-destructive",
          "hover:bg-destructive/10 transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        <Trash2 className="h-3 w-3" />
        Clear all
      </button>
    </div>
  );
}

// ─── Shared state (Context) ───────────────────────────────────────────────────

/**
 * Shared deep-edit state consumed by BOTH the viewport-level
 * {@link ContentEditToolbar} (count / select-all / undo / clear) and the
 * sheet-level {@link ContentEditZones} (per-element editable surfaces). Splitting
 * the historical monolithic overlay into a toolbar + zones lets the same
 * surface mount in the continuous (Word-like) view via `renderActiveOverlay`,
 * exactly mirroring FormFillOverlay, without the toolbar pushing the zones down.
 */
interface ContentEditContextValue {
  isActive: boolean;
  zoom: number;
  /** 0-based index of the active/parsed page. */
  pageIndex: number;
  loading: boolean;
  parseError: string | null;
  currentFile: File | null;
  parsedElements: ParsedElement[];
  zoneState: ZoneState;
  setZoneState: React.Dispatch<React.SetStateAction<ZoneState>>;
  activeImageId: string | null;
  setActiveImageId: React.Dispatch<React.SetStateAction<string | null>>;
  modCount: number;
  // Element interaction handlers (all stable callbacks)
  handleTextZoneClick: (element: TextElement, e: React.MouseEvent) => void;
  handleConfirmEdit: (element: TextElement) => void;
  handleCancelEdit: () => void;
  handleImageZoneClick: (element: ImageElement, e: React.MouseEvent) => void;
  handleImageReplace: (element: ImageElement, file: File) => void | Promise<void>;
  handleDeleteZone: (element: ParsedElement, e: React.MouseEvent) => void;
  handleRestoreZone: (elementId: string, e: React.MouseEvent) => void;
    handleUpdateBounds: (
    element: ParsedElement,
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
  handleConfirmAnnotationEdit: (element: AnnotationElement) => void;
  handleConfirmFormFieldEdit: (element: FormFieldElement) => void;
  // Toolbar actions
  handleSelectAllText: () => void;
  handleUndoLast: () => void;
  handleClearAll: () => void;
}

const ContentEditContext = createContext<ContentEditContextValue | null>(null);

/**
 * Read the shared deep-edit state. Throws if used outside a
 * {@link ContentEditProvider}, surfacing wiring mistakes immediately.
 */
function useContentEdit(): ContentEditContextValue {
  const ctx = useContext(ContentEditContext);
  if (!ctx) {
    throw new Error(
      "useContentEdit must be used within a <ContentEditProvider>",
    );
  }
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface ContentEditProviderProps {
  /** The current PDF file to analyze. */
  currentFile: File | null;
  /** 0-based index of the active page (effectivePageIndex in continuous mode). */
  pageIndex: number;
  /** Current zoom level (1 = 100%). */
  zoom: number;
  /** Whether content edit mode is active. */
  isActive: boolean;
  /** Callback when the accumulated modifications change. */
  onModificationsChange: (modifications: ElementModification[]) => void;
  children: React.ReactNode;
}

/**
 * Owns ALL deep-edit state (parsed elements for the active page, the
 * modifications Map, the open editor, image previews) and exposes it via
 * context so the toolbar and the zones — mounted in different parts of the tree
 * — stay perfectly in sync. Self-parses the active page via `useOpenPdf`,
 * re-parsing whenever the file/page/active-state changes (in continuous mode
 * the active page drives this).
 */
export function ContentEditProvider({
  currentFile,
  pageIndex,
  zoom,
  isActive,
  onModificationsChange,
  children,
}: ContentEditProviderProps) {
  const openPdf = useOpenPdf();

  const [parsedElements, setParsedElements] = useState<ParsedElement[]>([]);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Zone interaction state grouped for readability
    const [zoneState, setZoneState] = useState<ZoneState>({
    modifications: new Map(),
    activeEditId: null,
    editValue: "",
    hoveredZoneId: null,
    selectedId: null,
    imagePreviewMap: new Map(),
  });

  const [activeImageId, setActiveImageId] = useState<string | null>(null);

  // Track the last file+page combo we parsed to avoid redundant calls
  const lastParsedKey = useRef<string | null>(null);

  // ── Parse PDF when isActive changes or file/page changes ──────────────────

  useEffect(() => {
    if (!isActive || !currentFile) {
      setParsedElements([]);
      setParseError(null);
      lastParsedKey.current = null;
      return;
    }

    const key = `${currentFile.name}:${currentFile.size}:${pageIndex}`;
    if (lastParsedKey.current === key) return;

    let cancelled = false;

    const parse = async () => {
      setLoading(true);
      setParseError(null);
      try {
        const result = await openPdf.mutateAsync({
          file: currentFile,
          options: {
            extractText: true,
            extractImages: true,
            extractAnnotations: true,
            extractFormFields: true,
          },
        });

        if (cancelled) return;

        const page = result.pages[pageIndex];
        if (!page) {
          setParsedElements([]);
          lastParsedKey.current = key;
          return;
        }

        const visible = page.elements.filter(
          (el): el is ParsedElement =>
            el.visible &&
            !el.locked &&
            (el.type === "text" || el.type === "image" || el.type === "shape" || el.type === "annotation" || el.type === "form_field"),
        );

        setParsedElements(visible);
        lastParsedKey.current = key;
      } catch (err) {
        if (!cancelled) {
          setParseError(
            err instanceof Error
              ? err.message
              : "Failed to parse PDF content.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void parse();

    return () => {
      cancelled = true;
    };
    // openPdf.mutateAsync is stable within the mutation instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, currentFile, pageIndex]);

  // ── Modification helpers ───────────────────────────────────────────────────

  const pushModification = useCallback(
    (elementId: string, mod: ElementModification) => {
      setZoneState((prev) => {
        const next = new Map(prev.modifications);
        next.set(elementId, mod);
        return { ...prev, modifications: next };
      });
      setZoneState((prev) => {
        // Fire callback after state settled; collect from the latest map
        const all = Array.from(prev.modifications.values());
        // Use queueMicrotask to allow React to finish the update
        queueMicrotask(() => onModificationsChange(all));
        return prev;
      });
    },
    [onModificationsChange],
  );

  const removeModification = useCallback(
    (elementId: string) => {
      setZoneState((prev) => {
        const next = new Map(prev.modifications);
        next.delete(elementId);
        const all = Array.from(next.values());
        queueMicrotask(() => onModificationsChange(all));
        return { ...prev, modifications: next };
      });
    },
    [onModificationsChange],
  );

  // ── Text editing ──────────────────────────────────────────────────────────

  const handleTextZoneClick = useCallback(
    (element: TextElement, e: React.MouseEvent) => {
      e.stopPropagation();
      // Do not re-open if already editing this element
      setZoneState((prev) => {
        if (prev.activeEditId === element.elementId) return prev;
        return {
          ...prev,
          activeEditId: element.elementId,
          editValue: element.content,
        };
      });
    },
    [],
  );

  const handleConfirmEdit = useCallback(
    (element: TextElement) => {
      setZoneState((prev) => {
        if (prev.activeEditId !== element.elementId) return prev;
        const newContent = prev.editValue;

        if (newContent !== element.content) {
          const mod: ElementModification = {
            action: "update",
            pageNumber: pageIndex,
            element: { ...element, content: newContent } as unknown as Record<
              string,
              unknown
            >,
            oldBounds: {
              x: element.bounds.x,
              y: element.bounds.y,
              width: element.bounds.width,
              height: element.bounds.height,
            },
          };
          const next = new Map(prev.modifications);
          next.set(element.elementId, mod);
          const all = Array.from(next.values());
          queueMicrotask(() => onModificationsChange(all));
          return { ...prev, modifications: next, activeEditId: null };
        }

        return { ...prev, activeEditId: null };
      });
    },
    [pageIndex, onModificationsChange],
  );

  const handleCancelEdit = useCallback(() => {
    setZoneState((prev) => ({ ...prev, activeEditId: null }));
  }, []);

  // ── Image replacement ─────────────────────────────────────────────────────

  const handleImageZoneClick = useCallback(
    (element: ImageElement, e: React.MouseEvent) => {
      e.stopPropagation();
      setActiveImageId((prev) =>
        prev === element.elementId ? null : element.elementId,
      );
    },
    [],
  );

  const handleImageReplace = useCallback(
    async (element: ImageElement, file: File) => {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const mod: ElementModification = {
          action: "update",
          pageNumber: pageIndex,
          element: {
            ...element,
            source: { ...element.source, dataUrl },
          } as unknown as Record<string, unknown>,
          oldBounds: {
            x: element.bounds.x,
            y: element.bounds.y,
            width: element.bounds.width,
            height: element.bounds.height,
          },
        };
        setZoneState((prev) => {
          const nextMods = new Map(prev.modifications);
          nextMods.set(element.elementId, mod);
          const nextPreviews = new Map(prev.imagePreviewMap);
          nextPreviews.set(element.elementId, dataUrl);
          const all = Array.from(nextMods.values());
          queueMicrotask(() => onModificationsChange(all));
          return {
            ...prev,
            modifications: nextMods,
            imagePreviewMap: nextPreviews,
          };
        });
        setActiveImageId(null);
      } catch {
        // Silently ignore read failures — user can retry
      }
    },
    [pageIndex, onModificationsChange],
  );

  // ── Delete zone ───────────────────────────────────────────────────────────

  const handleDeleteZone = useCallback(
    (element: ParsedElement, e: React.MouseEvent) => {
      e.stopPropagation();
      const mod: ElementModification = {
        action: "delete",
        pageNumber: pageIndex,
        element: element as unknown as Record<string, unknown>,
        oldBounds: {
          x: element.bounds.x,
          y: element.bounds.y,
          width: element.bounds.width,
          height: element.bounds.height,
        },
      };
      pushModification(element.elementId, mod);
    },
    [pageIndex, pushModification],
  );

  const handleRestoreZone = useCallback(
    (elementId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      removeModification(elementId);
      // Also clear image preview if any
      setZoneState((prev) => {
        if (!prev.imagePreviewMap.has(elementId)) return prev;
        const next = new Map(prev.imagePreviewMap);
        next.delete(elementId);
        return { ...prev, imagePreviewMap: next };
      });
    },
    [removeModification],
  );

    const handleUpdateBounds = useCallback(
    (
      element: ParsedElement,
      bounds: { x: number; y: number; width: number; height: number },
    ) => {
      setZoneState((prev) => {
        const existing = prev.modifications.get(element.elementId);
        const base = (existing?.element ?? element) as Record<string, unknown>;
        const mod: ElementModification = {
          action: "update",
          pageNumber: pageIndex,
          element: { ...base, bounds },
          oldBounds: existing?.oldBounds ?? {
            x: element.bounds.x,
            y: element.bounds.y,
            width: element.bounds.width,
            height: element.bounds.height,
          },
        };
        const next = new Map(prev.modifications);
        next.set(element.elementId, mod);
        const all = Array.from(next.values());
        queueMicrotask(() => onModificationsChange(all));
        return { ...prev, modifications: next, selectedId: element.elementId };
      });
    },
    [pageIndex, onModificationsChange],
  );

  // ── Annotation / form-field inline confirm ─────────────────────────────────

  const handleConfirmAnnotationEdit = useCallback(
    (element: AnnotationElement) => {
      setZoneState((prev) => {
        if (prev.activeEditId !== element.elementId) return prev;
        const newContent = prev.editValue;
        if (newContent !== element.content) {
          const mod: ElementModification = {
            action: "update",
            pageNumber: pageIndex,
            element: { ...element, content: newContent } as unknown as Record<string, unknown>,
            oldBounds: {
              x: element.bounds.x,
              y: element.bounds.y,
              width: element.bounds.width,
              height: element.bounds.height,
            },
          };
          const next = new Map(prev.modifications);
          next.set(element.elementId, mod);
          const all = Array.from(next.values());
          queueMicrotask(() => onModificationsChange(all));
          return { ...prev, modifications: next, activeEditId: null };
        }
        return { ...prev, activeEditId: null };
      });
    },
    [pageIndex, onModificationsChange],
  );

  const handleConfirmFormFieldEdit = useCallback(
    (element: FormFieldElement) => {
      setZoneState((prev) => {
        if (prev.activeEditId !== element.elementId) return prev;
        const newValue = prev.editValue;
        if (newValue !== ((element.value as string) || "")) {
          const mod: ElementModification = {
            action: "update",
            pageNumber: pageIndex,
            element: { ...element, value: newValue } as unknown as Record<string, unknown>,
            oldBounds: {
              x: element.bounds.x,
              y: element.bounds.y,
              width: element.bounds.width,
              height: element.bounds.height,
            },
          };
          const next = new Map(prev.modifications);
          next.set(element.elementId, mod);
          const all = Array.from(next.values());
          queueMicrotask(() => onModificationsChange(all));
          return { ...prev, modifications: next, activeEditId: null };
        }
        return { ...prev, activeEditId: null };
      });
    },
    [pageIndex, onModificationsChange],
  );

  // ── Toolbar actions ────────────────────────────────────────────────────────

  const handleSelectAllText = useCallback(() => {
    // Opens the first undeleted text zone for editing; subsequent calls iterate
    setZoneState((prev) => {
      const firstText = parsedElements.find(
        (el) =>
          isTextElement(el) &&
          prev.modifications.get(el.elementId)?.action !== "delete",
      );
      if (firstText && isTextElement(firstText)) {
        return {
          ...prev,
          activeEditId: firstText.elementId,
          editValue: firstText.content,
        };
      }
      return prev;
    });
  }, [parsedElements]);

  const modificationHistory = useRef<string[]>([]);

  const handleUndoLast = useCallback(() => {
    const history = modificationHistory.current;
    if (history.length === 0) return;
    const lastId = history[history.length - 1];
    if (lastId) {
      removeModification(lastId);
      modificationHistory.current = history.slice(0, -1);
    }
  }, [removeModification]);

  const handleClearAll = useCallback(() => {
    setZoneState((prev) => ({
      ...prev,
      modifications: new Map(),
      imagePreviewMap: new Map(),
      activeEditId: null,
    }));
    modificationHistory.current = [];
    onModificationsChange([]);
  }, [onModificationsChange]);

  // Track modification history for undo
  useEffect(() => {
    const ids = Array.from(zoneState.modifications.keys());
    modificationHistory.current = ids;
  }, [zoneState.modifications]);

  const modCount = zoneState.modifications.size;

  const value: ContentEditContextValue = {
    isActive,
    zoom,
    pageIndex,
    loading,
    parseError,
    currentFile,
    parsedElements,
    zoneState,
    setZoneState,
    activeImageId,
    setActiveImageId,
    modCount,
    handleTextZoneClick,
    handleConfirmEdit,
    handleCancelEdit,
    handleImageZoneClick,
    handleImageReplace,
    handleDeleteZone,
    handleRestoreZone,
    handleUpdateBounds,
    handleConfirmAnnotationEdit,
    handleConfirmFormFieldEdit,
    handleSelectAllText,
    handleUndoLast,
    handleClearAll,
  };

  return (
    <ContentEditContext.Provider value={value}>
      {children}
    </ContentEditContext.Provider>
  );
}

// ─── Toolbar (viewport-level) ─────────────────────────────────────────────────

/** The bare blue "Content Edit Mode" bar, fed from context. */
function ToolbarBar() {
  const {
    modCount,
    handleSelectAllText,
    handleUndoLast,
    handleClearAll,
  } = useContentEdit();
  return (
    <Toolbar
      modificationCount={modCount}
      onSelectAllText={handleSelectAllText}
      onUndoLast={handleUndoLast}
      onClearAll={handleClearAll}
      canUndo={modCount > 0}
    />
  );
}

/**
 * Viewport-level deep-edit toolbar. Mount as a sibling of the canvas/scroller
 * (NOT inside the page sheet) so it stays pinned to the top of the canvas area
 * in BOTH the single-page and continuous views — like the historical bar — and
 * never pushes the editable zones down. Renders nothing when content edit is
 * inactive. Absolutely positioned: it does not affect canvas layout.
 */
export function ContentEditToolbar() {
  const { isActive } = useContentEdit();
  if (!isActive) return null;
  return (
    <div className="absolute inset-x-0 top-0 z-20">
      <ToolbarBar />
    </div>
  );
}

// ─── Zones (sheet-level) ──────────────────────────────────────────────────────

export interface ContentEditZonesProps {
  /**
   * 0-based index of the page these zones cover. In the continuous view this is
   * the active page passed by `renderActiveOverlay`; in single-page it is the
   * current page. Zones only render when it matches the parsed/active page.
   */
  pageIndex: number;
  /**
   * Returns the rendered PDF canvas (the active page's Fabric lower canvas) for
   * background sampling behind text editors. Pulled lazily at sample time so it
   * always reflects the currently-mounted active page. Does not mutate any
   * shared ref.
   */
  getPdfCanvas?: () => HTMLCanvasElement | null;
}

/**
 * The per-element editable surfaces ONLY (no toolbar, no shell). Mount inside
 * the page sheet — single-page via `EditorCanvas`'s `overlay` prop, continuous
 * via `PageSlot`'s `renderActiveOverlay` — so zones positioned at
 * `bounds.x*zoom, bounds.y*zoom` from the sheet's top-left line up exactly with
 * the rendered glyphs, the same model FormFillOverlay uses. `pointer-events-auto`
 * so it captures interaction (and intercepts the canvas) while content edit is
 * on; the wrapping overlay container is `pointer-events-none`.
 */
export function ContentEditZones({ pageIndex, getPdfCanvas }: ContentEditZonesProps) {
  const {
    isActive,
    zoom,
    pageIndex: activePageIndex,
    loading,
    parseError,
    currentFile,
    parsedElements,
    zoneState,
    setZoneState,
    activeImageId,
    setActiveImageId,
    handleTextZoneClick,
    handleConfirmEdit,
    handleCancelEdit,
    handleImageZoneClick,
    handleImageReplace,
    handleDeleteZone,
    handleRestoreZone,
    handleUpdateBounds,
    handleConfirmAnnotationEdit,
    handleConfirmFormFieldEdit,
  } = useContentEdit();

  if (!isActive || pageIndex !== activePageIndex) return null;

  if (loading) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-auto">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <p className="text-sm text-muted-foreground">Scanning PDF content…</p>
        </div>
      </div>
    );
  }

  if (parseError !== null) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center p-6 pointer-events-auto">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm font-medium text-destructive">
            Failed to parse content
          </p>
          <p className="text-xs text-muted-foreground">{parseError}</p>
        </div>
      </div>
    );
  }

  if (!currentFile) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-auto">
        <p className="text-sm text-muted-foreground">
          No PDF file open. Load a file to edit its content.
        </p>
      </div>
    );
  }

  if (parsedElements.length === 0) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-auto">
        <div className="flex flex-col items-center gap-3 text-center">
          <ScanSearch className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No editable content found on this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-20 pointer-events-auto">
      <div
        className="absolute inset-0"
        onClick={() => {
          setZoneState((prev) => ({
            ...prev,
            activeEditId: null,
            selectedId: null,
          }));
          setActiveImageId(null);
        }}
      />

      {parsedElements.map((element) => {
        const { elementId } = element;
        const mod = zoneState.modifications.get(elementId);
        const bounds = boundsFromMod(element, mod);
        const isDeleted = mod?.action === "delete";
        const isModified = mod?.action === "update";
        const isSelected = zoneState.selectedId === elementId;
        const isTextEditing =
          isTextElement(element) && zoneState.activeEditId === elementId;
        const isImageControls =
          isImageElement(element) && activeImageId === elementId;
        const isHovered = zoneState.hoveredZoneId === elementId;
        const imagePreview = zoneState.imagePreviewMap.get(elementId) ?? null;
        const left = bounds.x * zoom;
        const top = bounds.y * zoom;
        const width = bounds.width * zoom;
        const height = bounds.height * zoom;

        return (
          <div
            key={elementId}
            style={{ position: "absolute", left, top, width, height }}
            onMouseEnter={() =>
              setZoneState((prev) => ({
                ...prev,
                hoveredZoneId: elementId,
              }))
            }
            onPointerDown={() =>
              setZoneState((prev) => ({
                ...prev,
                hoveredZoneId: elementId,
              }))
            }
            onMouseLeave={() =>
              setZoneState((prev) => ({
                ...prev,
                hoveredZoneId:
                  prev.hoveredZoneId === elementId ? null : prev.hoveredZoneId,
              }))
            }
            onContextMenu={(e) => {
              e.preventDefault();
              if (!isDeleted) handleDeleteZone(element, e);
            }}
          >
            {isDeleted ? (
              <div
                className="absolute inset-0 rounded-sm border-2 border-red-500 bg-red-100/30"
                style={{ zIndex: 30 }}
              >
                <div className="absolute inset-0 overflow-hidden rounded-sm" aria-hidden="true">
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "-10%",
                      width: "120%",
                      height: 2,
                      background: "rgb(239 68 68 / 0.7)",
                      transform: `rotate(${
                        width > 0
                          ? Math.atan2(height, width) * (180 / Math.PI)
                          : 45
                      }deg)`,
                      transformOrigin: "center",
                    }}
                  />
                </div>
                <button
                  onClick={(e) => handleRestoreZone(elementId, e)}
                  className={cn(
                    "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                    "flex items-center gap-1 rounded px-2 py-0.5",
                    "text-[10px] font-medium text-white bg-red-600 hover:bg-red-500",
                    "shadow transition-colors",
                  )}
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore
                </button>
              </div>
            ) : (
              <div className="absolute inset-0">
                {isTextElement(element) && !isTextEditing ? (
                  <ZoneResizeFrame
                    zoom={zoom}
                    selected={isSelected}
                    box={bounds}
                    onSelect={() =>
                      setZoneState((prev) => ({
                        ...prev,
                        selectedId: elementId,
                        activeEditId: null,
                      }))
                    }
                    onEdit={() =>
                      handleTextZoneClick(element, {
                        stopPropagation() {},
                      } as React.MouseEvent)
                    }
                    onBoundsChange={(next) => handleUpdateBounds(element, next)}
                  >
                    {isModified ? (
                      <span className="absolute -top-4 right-0 rounded-t bg-yellow-500 px-1 py-0.5 text-[9px] font-semibold text-white">
                        edited
                      </span>
                    ) : null}
                    {isHovered && !isSelected ? <ZoneTooltip element={element} /> : null}
                  </ZoneResizeFrame>
                ) : null}

                {isTextElement(element) && isTextEditing ? (
                  <InlineTextEditor
                    element={element}
                    zoom={zoom}
                    value={zoneState.editValue}
                    onChange={(val) =>
                      setZoneState((prev) => ({ ...prev, editValue: val }))
                    }
                    onConfirm={() => handleConfirmEdit(element)}
                    onCancel={handleCancelEdit}
                    backgroundImage={(() => {
                      const canvas = getPdfCanvas?.() ?? null;
                      return canvas
                        ? captureCanvasRegion(canvas, bounds, zoom)
                        : null;
                    })()}
                  />
                ) : null}

                {isImageElement(element) && !isImageControls ? (
                  <div
                    className={cn(
                      "absolute inset-0 cursor-pointer rounded-sm border-2 border-dashed transition-colors",
                      isModified
                        ? "border-yellow-500 bg-yellow-100/20"
                        : isHovered
                          ? "border-green-400 bg-green-50/20"
                          : "border-transparent",
                    )}
                    onClick={(e) => handleImageZoneClick(element, e)}
                  >
                    {imagePreview !== null ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imagePreview}
                        alt="Replaced image preview"
                        className="absolute inset-0 h-full w-full rounded-sm object-contain"
                      />
                    ) : null}
                    {isHovered ? <ZoneTooltip element={element} /> : null}
                  </div>
                ) : null}

                {isImageElement(element) && isImageControls ? (
                  <ImageZoneControls
                    element={element}
                    zoom={zoom}
                    previewDataUrl={imagePreview}
                    onReplace={(file) => handleImageReplace(element, file)}
                    onClose={() => setActiveImageId(null)}
                  />
                ) : null}

                {isShapeElement(element) ? (
                  <div
                    className={cn(
                      "absolute inset-0 cursor-pointer rounded-sm border-2 border-dashed transition-colors",
                      isHovered ? "border-purple-400 bg-purple-50/20" : "border-transparent",
                    )}
                  >
                    {isHovered ? <ZoneTooltip element={element} /> : null}
                  </div>
                ) : null}

                {isAnnotationElement(element) &&
                zoneState.activeEditId !== elementId ? (
                  <div
                    className={cn(
                      "absolute inset-0 cursor-pointer rounded-sm border-2 border-dashed transition-colors",
                      isHovered ? "border-orange-400 bg-orange-50/20" : "border-transparent",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (element.content) {
                        setZoneState((prev) => ({
                          ...prev,
                          activeEditId: element.elementId,
                          editValue: element.content || "",
                        }));
                      }
                    }}
                  >
                    {isHovered ? <ZoneTooltip element={element} /> : null}
                  </div>
                ) : null}

                {isAnnotationElement(element) &&
                zoneState.activeEditId === element.elementId &&
                element.content ? (
                  <InlineTextEditor
                    element={{
                      ...element,
                      type: "text" as const,
                      content: element.content,
                      style: {
                        fontFamily: "Arial, sans-serif",
                        fontSize: 12,
                        color: "#000000",
                        textAlign: "left" as const,
                        lineHeight: 1.2,
                        fontWeight: "normal" as const,
                        fontStyle: "normal" as const,
                        letterSpacing: 0,
                        underline: false,
                        strikethrough: false,
                        opacity: 1,
                      },
                    } as unknown as TextElement}
                    zoom={zoom}
                    value={zoneState.editValue}
                    onChange={(val) =>
                      setZoneState((prev) => ({ ...prev, editValue: val }))
                    }
                    onConfirm={() => handleConfirmAnnotationEdit(element)}
                    onCancel={handleCancelEdit}
                    backgroundImage={null}
                  />
                ) : null}

                {isFormFieldElement(element) &&
                zoneState.activeEditId !== elementId ? (
                  <ZoneResizeFrame
                    zoom={zoom}
                    selected={isSelected}
                    box={bounds}
                    onSelect={() =>
                      setZoneState((prev) => ({
                        ...prev,
                        selectedId: elementId,
                        activeEditId: null,
                      }))
                    }
                    onEdit={() => {
                      if (element.fieldType === "text") {
                        setZoneState((prev) => ({
                          ...prev,
                          selectedId: elementId,
                          activeEditId: element.elementId,
                          editValue: (element.value as string) || "",
                        }));
                      }
                    }}
                    onBoundsChange={(next) => handleUpdateBounds(element, next)}
                  >
                    {isModified ? (
                      <span className="absolute -top-4 right-0 rounded-t bg-yellow-500 px-1 py-0.5 text-[9px] font-semibold text-white">
                        edited
                      </span>
                    ) : null}
                    {isHovered && !isSelected ? <ZoneTooltip element={element} /> : null}
                  </ZoneResizeFrame>
                ) : null}

                {isFormFieldElement(element) &&
                zoneState.activeEditId === element.elementId &&
                element.fieldType === "text" ? (
                  <InlineTextEditor
                    element={{
                      ...element,
                      type: "text" as const,
                      content: (element.value as string) || "",
                      style: {
                        fontFamily: "Arial, sans-serif",
                        fontSize: 11,
                        color: "#000000",
                        textAlign: "left" as const,
                        lineHeight: 1.2,
                        fontWeight: "normal" as const,
                        fontStyle: "normal" as const,
                        letterSpacing: 0,
                        underline: false,
                        strikethrough: false,
                        opacity: 1,
                      },
                    } as unknown as TextElement}
                    zoom={zoom}
                    value={zoneState.editValue}
                    onChange={(val) =>
                      setZoneState((prev) => ({ ...prev, editValue: val }))
                    }
                    onConfirm={() => handleConfirmFormFieldEdit(element)}
                    onCancel={handleCancelEdit}
                    backgroundImage={null}
                  />
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
// ─── Composed backward-compatible layer (embed editor) ────────────────────────

/**
 * Single `<main>`-cover deep-edit overlay: toolbar pinned at the top with the
 * editable zones filling the area beneath it. Mount as an absolutely-positioned
 * sibling that covers the editor canvas. Renders nothing when `isActive` is
 * false. Kept for the embed editor; the main editor composes
 * {@link ContentEditProvider} + {@link ContentEditToolbar} + {@link ContentEditZones}
 * directly so the zones can live in the page sheet (continuous-view parity).
 */
export function ContentEditLayer({
  currentFile,
  currentPageIndex,
  zoom,
  isActive,
  onModificationsChange,
  canvasRef,
}: ContentEditLayerProps) {
  return (
    <ContentEditProvider
      currentFile={currentFile}
      pageIndex={currentPageIndex}
      zoom={zoom}
      isActive={isActive}
      onModificationsChange={onModificationsChange}
    >
      <ContentEditLegacyShell
        pageIndex={currentPageIndex}
        {...(canvasRef ? { getPdfCanvas: () => canvasRef.current } : {})}
      />
    </ContentEditProvider>
  );
}

interface ContentEditLegacyShellProps {
  pageIndex: number;
  getPdfCanvas?: () => HTMLCanvasElement | null;
}

/** Reproduces the historical layout: in-flow toolbar above, zones below. */
function ContentEditLegacyShell({
  pageIndex,
  getPdfCanvas,
}: ContentEditLegacyShellProps) {
  const { isActive } = useContentEdit();
  if (!isActive) return null;
  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-sm">
      <ToolbarBar />
      <div className="relative flex-1">
        <ContentEditZones
          pageIndex={pageIndex}
          {...(getPdfCanvas ? { getPdfCanvas } : {})}
        />
      </div>
    </div>
  );
}
