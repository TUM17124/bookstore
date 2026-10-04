/**
 * Pure helpers behind the watermark dialog: turn what the user typed into the
 * options the PDF service accepts (`POST /api/pdf/watermark`), so the rules
 * (empty font size = automatic, hex colour -> 0..1 triple, angle range, page
 * list syntax) are unit-tested without rendering the dialog.
 */

export type WatermarkPosition =
  | "center-diagonal"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "header"
  | "footer";

export const DEFAULT_WATERMARK_TEXT = "CONFIDENTIAL";
export const DEFAULT_WATERMARK_COLOR = "#808080";
export const MIN_FONT_SIZE = 1;
export const MAX_FONT_SIZE = 500;

/** The angle (degrees, counter-clockwise) a preset uses when the user does not choose one. */
export function defaultAngle(position: WatermarkPosition): number {
  return position === "center-diagonal" ? 45 : 0;
}

/** "#rrggbb" (or "#rgb") -> [r, g, b] in 0..1; null when it is not a hex colour. */
export function hexToRgb01(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const round = (v: number) => Math.round((v / 255) * 1000) / 1000;
  return [round((n >> 16) & 255), round((n >> 8) & 255), round(n & 255)];
}

/** "1-3, 5, 7-9" -> [1,2,3,5,7,8,9]; blank or unusable -> undefined (all pages). */
export function parsePages(raw: string): number[] | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const out = new Set<number>();
  for (const part of trimmed.split(",")) {
    const seg = part.trim();
    const range = seg.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let i = start; i <= end && i - start < 10_000; i++) out.add(i);
    } else if (/^\d+$/.test(seg)) {
      out.add(Number(seg));
    }
  }
  const pages = Array.from(out).filter((n) => n >= 1).sort((a, b) => a - b);
  return pages.length > 0 ? pages : undefined;
}

export interface TextWatermarkForm {
  text: string;
  position: WatermarkPosition;
  /** 5-80 */
  opacityPct: number;
  pagesInput: string;
  /** Degrees counter-clockwise, -180..180. */
  angle: number;
  /** Raw input; blank = automatic. */
  fontSizeInput: string;
  colorHex: string;
}

export interface TextWatermarkOptions {
  text: string;
  position: WatermarkPosition;
  opacity: number;
  pages?: number[];
  rotation: number;
  fontSize?: number;
  color?: [number, number, number];
}

/** Validation message key (under editor.watermark) for the font-size field, or null when fine. */
export function fontSizeError(input: string): "fontSizeInvalid" | null {
  const t = input.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE ? null : "fontSizeInvalid";
}

export function buildTextWatermarkOptions(f: TextWatermarkForm): TextWatermarkOptions {
  const fontSize = f.fontSizeInput.trim() === "" || fontSizeError(f.fontSizeInput) ? undefined : Number(f.fontSizeInput);
  const color = hexToRgb01(f.colorHex) ?? undefined;
  const angle = Math.max(-360, Math.min(360, Number.isFinite(f.angle) ? f.angle : 0));
  return {
    text: f.text.trim(),
    position: f.position,
    opacity: f.opacityPct / 100,
    pages: parsePages(f.pagesInput),
    rotation: angle,
    ...(fontSize !== undefined ? { fontSize } : {}),
    // Mid-grey is the service default; only send a colour the user can have changed.
    ...(color ? { color } : {}),
  };
}
