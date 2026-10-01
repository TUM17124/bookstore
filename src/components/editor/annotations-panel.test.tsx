// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthFetchError } from "@/lib/auth-fetch";
import { AnnotationsPanel } from "./annotations-panel";

// Batch 3: the native Annotations panel used to swallow list errors
// (`catch {}`), so Refresh looked dead when every request was a 401.

let root: Root | null = null;
let el: HTMLDivElement | null = null;

async function render(ui: React.ReactElement) {
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(ui);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
});

function button(label: string) {
  return [...document.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === label || b.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
}

describe("AnnotationsPanel (native mode)", () => {
  it("shows a clear error with Retry when loading fails, then recovers", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new AuthFetchError("Your session has expired. Please log in again.", 401))
      .mockResolvedValueOnce([{ page: 1, index: 0, subtype: "Square", contents: "Box", author: "" }]);
    await render(
      <AnnotationsPanel elements={[]} selectedElementIds={[]} onListAnnotations={list} onRemoveAnnotation={vi.fn()} onAdd={vi.fn()} addBusy={false} />,
    );
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toMatch(/Couldn't load annotations/);
    expect(alert?.textContent).toMatch(/session has expired/);

    await act(async () => {
      button("Retry")!.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(list).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.textContent).toContain("Box");
  });

  it("the Refresh button re-requests the list", async () => {
    const list = vi.fn().mockResolvedValue([]);
    await render(
      <AnnotationsPanel elements={[]} selectedElementIds={[]} onListAnnotations={list} onRemoveAnnotation={vi.fn()} onAdd={vi.fn()} addBusy={false} />,
    );
    await act(async () => {
      button("Refresh")!.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("each add-shape button calls onAdd with its type", async () => {
    const onAdd = vi.fn();
    await render(
      <AnnotationsPanel elements={[]} selectedElementIds={[]} onListAnnotations={vi.fn().mockResolvedValue([])} onAdd={onAdd} addBusy={false} />,
    );
    for (const label of ["Add circle", "Add polygon", "Add polyline", "Add caret"]) {
      button(label)!.click();
    }
    expect(onAdd.mock.calls.map((c) => c[0])).toEqual(["circle", "polygon", "polyline", "caret"]);
  });
});
