import { describe, expect, it } from "vitest";
import {
  flowLinesFromMeasured,
  flowSliceContent,
  paginateFlowLines,
  wrapPlainText,
  type FlowLine,
} from "./text-pagination";

const H = 20;

function linesOf(text: string, chars: number): FlowLine[] {
  return wrapPlainText(text, chars, H);
}

describe("wrapPlainText", () => {
  it("keeps words intact and preserves paragraph breaks", () => {
    const text = "alpha beta gamma\n\nnext";
    const lines = wrapPlainText(text, 10, H);
    expect(lines.map((line) => text.slice(line.start, line.end))).toEqual([
      "alpha beta",
      "gamma",
      "",
      "next",
    ]);
    expect(flowLinesFromMeasured(text.length, lines.map((line, index, all) => ({
      text: text.slice(line.start, line.end),
      gapAfter: index < all.length - 1 ? Math.max(0, (all[index + 1]?.start ?? line.end) - line.end) : 0,
      height: H,
    })))).not.toBeNull();
  });

  it("splits a token that is wider than the line", () => {
    const text = "abcdefghij";
    const lines = wrapPlainText(text, 4, H);
    expect(lines.map((line) => text.slice(line.start, line.end))).toEqual([
      "abcd",
      "efgh",
      "ij",
    ]);
  });
});

describe("paginateFlowLines", () => {
  it("leaves a short note on the page where it was typed", () => {
    const text = "hello";
    const lines = linesOf(text, 40);
    const slices = paginateFlowLines(lines, 200, 400);
    expect(slices).toHaveLength(1);
    expect(flowSliceContent(text, lines, slices[0]!)).toBe("hello");
  });

  it("flows a three-page paste downward without dropping or repeating text", () => {
    const paragraph = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const text = `${paragraph}\n${paragraph}\n${paragraph}`;
    const lines = linesOf(text, 24);
    // Two lines under the cursor, five lines on every new page.
    const slices = paginateFlowLines(lines, H * 2 + 1, H * 5 + 1);
    expect(slices.length).toBeGreaterThanOrEqual(3);
    expect(slices[0]!.lineIndexes).toHaveLength(2);
    for (const slice of slices.slice(1)) {
      expect(slice.lineIndexes.length).toBeLessThanOrEqual(5);
      expect(slice.height).toBeLessThanOrEqual(H * 5 + 0.5);
    }
    const rebuilt = slices
      .map((slice) => flowSliceContent(text, lines, slice))
      .join("\n");
    const words = rebuilt.split(/\s+/).filter(Boolean);
    expect(words).toEqual(text.split(/\s+/).filter(Boolean));
    // Each following page starts at the top of its own slice, in order.
    expect(slices[1]!.start).toBeGreaterThan(slices[0]!.end - 1);
    expect(slices[2]!.start).toBeGreaterThan(slices[1]!.start);
  });

  it("does not stack another line under one that already fills the page", () => {
    const lines: FlowLine[] = [
      { start: 0, end: 1, height: 100 },
      { start: 2, end: 3, height: 20 },
    ];
    const slices = paginateFlowLines(lines, 100, 200);
    expect(slices.map((slice) => slice.lineIndexes)).toEqual([[0], [1]]);
  });
});

describe("flowLinesFromMeasured", () => {
  it("rejects a walk that does not cover the source", () => {
    expect(
      flowLinesFromMeasured(5, [{ text: "hi", gapAfter: 0, height: 10 }]),
    ).toBeNull();
  });

  it("accounts for a wrap gap between visual lines", () => {
    const lines = flowLinesFromMeasured(11, [
      { text: "hello", gapAfter: 1, height: 16 },
      { text: "world", gapAfter: 0, height: 16 },
    ]);
    expect(lines).toEqual([
      { start: 0, end: 5, height: 16 },
      { start: 6, end: 11, height: 16 },
    ]);
  });
});
