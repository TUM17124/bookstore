import { afterEach, describe, expect, it } from "vitest";
import type { TextElement } from "@giga-pdf/types";
import { useOperationsStore } from "./operations-store";

const bounds = { x: 10, y: 20, width: 80, height: 16 };

function textElement(content: string): TextElement {
  return {
    elementId: "text-1",
    type: "text",
    bounds,
    transform: { rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
    layerId: null,
    locked: false,
    visible: true,
    content,
    style: {
      fontFamily: "Arial",
      fontSize: 12,
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#000000",
      opacity: 1,
      textAlign: "left",
      lineHeight: 1,
      letterSpacing: 0,
      writingMode: "horizontal-tb",
      underline: false,
      strikethrough: false,
      backgroundColor: null,
      verticalAlign: "baseline",
      originalFont: null,
    },
    ocrConfidence: null,
    linkUrl: null,
    linkPage: null,
  };
}

afterEach(() => {
  useOperationsStore.getState().clear();
});

describe("pending element operations", () => {
  it("keeps a newer coalesced edit when draining a save snapshot", () => {
    const store = useOperationsStore.getState();
    store.queueUpdate(1, textElement("first"), bounds);
    const snapshot = store.peek();

    store.queueUpdate(1, textElement("latest"), bounds);
    const drained = store.drain(snapshot);

    expect(drained).toHaveLength(0);
    expect(store.peek()).toHaveLength(1);
    expect((store.peek()[0]?.element as TextElement).content).toBe("latest");
  });

  it("keeps operations added while a snapshot is being applied", () => {
    const store = useOperationsStore.getState();
    store.queueDelete(1, "text-1", bounds);
    const snapshot = store.peek();

    store.queueDelete(1, "text-2", bounds);
    const drained = store.drain(snapshot);

    expect(drained).toHaveLength(1);
    expect(store.peek()).toHaveLength(1);
    expect(store.peek()[0]?.element.elementId).toBe("text-2");
  });
});
