import { describe, expect, it } from "vitest";
import * as fabric from "fabric/node";
import type { TextElement } from "@giga-pdf/types";
import { renderElementsOverlay } from "./render-elements";

function textElement(content: string, width: number, height = 14): TextElement {
  return {
    elementId: "native-run", type: "text", content, index: 0,
    bounds: { x: 50, y: 48, width, height },
    transform: { rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
    layerId: null, locked: false, visible: true,
    style: { fontFamily: "Arial", fontSize: 14, fontWeight: "normal", fontStyle: "normal", color: "#000000", opacity: 1, textAlign: "left", lineHeight: 1.2, letterSpacing: 0, writingMode: "horizontal-tb", underline: false, strikethrough: false, backgroundColor: null, verticalAlign: "baseline", originalFont: null },
    ocrConfidence: null, linkUrl: null, linkPage: null,
  };
}

describe("PDF text overlay line fidelity", () => {
  it("does not wrap native text when browser metrics are 0.1pt wider than the PDF", async () => {
    const content = "Reload must show this sentence once.";
    const measured = new fabric.IText(content, { fontSize: 14, fontFamily: "Arial" }).width;
    const canvas = new fabric.Canvas(undefined, { width: 595, height: 842 });
    try {
      await renderElementsOverlay(canvas, [textElement(content, measured - 0.1)], fabric, { groupParagraphs: false });
      const rendered = canvas.getObjects()[0] as fabric.IText;
      expect(rendered.textLines).toEqual([content]);
      expect(rendered.getScaledHeight()).toBeLessThan(24);
    } finally {
      await canvas.dispose();
    }
  });

  it("still wraps a user-created flowing text box", async () => {
    const element = textElement("A paragraph that must wrap inside its text box.", 80, 100);
    delete element.index;
    const canvas = new fabric.Canvas(undefined, { width: 595, height: 842 });
    try {
      await renderElementsOverlay(canvas, [element], fabric, { groupParagraphs: false });
      const rendered = canvas.getObjects()[0] as fabric.Textbox;
      expect(rendered).toBeInstanceOf(fabric.Textbox);
      expect(rendered.textLines.length).toBeGreaterThan(1);
      expect(rendered.top).toBe(48);
    } finally {
      await canvas.dispose();
    }
  });
});
