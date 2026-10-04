import { describe, expect, it } from "vitest";
import {
  buildTextWatermarkOptions,
  defaultAngle,
  fontSizeError,
  hexToRgb01,
  parsePages,
  type TextWatermarkForm,
} from "./watermark-options";

const form = (over: Partial<TextWatermarkForm> = {}): TextWatermarkForm => ({
  text: " CONFIDENTIAL ",
  position: "center-diagonal",
  opacityPct: 25,
  pagesInput: "",
  angle: 45,
  fontSizeInput: "",
  colorHex: "#808080",
  ...over,
});

describe("watermark options", () => {
  it("builds the service options: trimmed text, opacity 0..1, explicit angle, grey default colour", () => {
    expect(buildTextWatermarkOptions(form())).toEqual({
      text: "CONFIDENTIAL",
      position: "center-diagonal",
      opacity: 0.25,
      pages: undefined,
      rotation: 45,
      color: [0.502, 0.502, 0.502],
    });
  });

  it("blank font size means automatic (not sent); a valid one is sent as a number", () => {
    expect("fontSize" in buildTextWatermarkOptions(form({ fontSizeInput: "  " }))).toBe(false);
    expect(buildTextWatermarkOptions(form({ fontSizeInput: "36" })).fontSize).toBe(36);
  });

  it("rejects font sizes outside 1-500 and never sends them", () => {
    for (const bad of ["0", "-3", "501", "abc"]) {
      expect(fontSizeError(bad)).toBe("fontSizeInvalid");
      expect("fontSize" in buildTextWatermarkOptions(form({ fontSizeInput: bad }))).toBe(false);
    }
    for (const ok of ["", "1", "500", "12.5"]) expect(fontSizeError(ok)).toBeNull();
  });

  it("converts hex colours, including 3-digit hex, and ignores garbage", () => {
    expect(hexToRgb01("#ff0000")).toEqual([1, 0, 0]);
    expect(hexToRgb01("#0f0")).toEqual([0, 1, 0]);
    expect(hexToRgb01("blue")).toBeNull();
    expect(buildTextWatermarkOptions(form({ colorHex: "nope" })).color).toBeUndefined();
  });

  it("clamps the angle to the service range", () => {
    expect(buildTextWatermarkOptions(form({ angle: 999 })).rotation).toBe(360);
    expect(buildTextWatermarkOptions(form({ angle: -30 })).rotation).toBe(-30);
    expect(buildTextWatermarkOptions(form({ angle: NaN })).rotation).toBe(0);
  });

  it("presets default to 45° for the diagonal and 0° elsewhere", () => {
    expect(defaultAngle("center-diagonal")).toBe(45);
    for (const p of ["top-left", "top-right", "bottom-left", "bottom-right", "header", "footer"] as const) {
      expect(defaultAngle(p)).toBe(0);
    }
  });

  it("parses page lists", () => {
    expect(parsePages("")).toBeUndefined();
    expect(parsePages("1-3, 5, 7-9")).toEqual([1, 2, 3, 5, 7, 8, 9]);
    expect(parsePages("0, x")).toBeUndefined();
  });
});
