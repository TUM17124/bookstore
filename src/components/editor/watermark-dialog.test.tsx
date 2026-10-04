// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn(async () => new Blob(["pdf"]));
vi.mock("@giga-pdf/api", () => ({
  useAddWatermark: () => ({ mutateAsync, isPending: false, isError: false, error: null }),
  useAddImageWatermark: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  downloadBlob: vi.fn(),
}));

import { WatermarkDialog } from "./watermark-dialog";

let root: Root | null = null;
let el: HTMLDivElement | null = null;

async function render(ui: React.ReactElement) {
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(ui);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  mutateAsync.mockClear();
});

// React tracks the input value setter; set it natively so onChange fires.
function setValue(input: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

const file = new File(["%PDF"], "a.pdf", { type: "application/pdf" });

describe("WatermarkDialog (text mode)", () => {
  it("defaults to the English text CONFIDENTIAL", async () => {
    await render(<WatermarkDialog open onClose={() => {}} currentFile={file} />);
    const text = document.querySelector('input[placeholder="e.g. CONFIDENTIAL"]') as HTMLInputElement;
    expect(text.value).toBe("CONFIDENTIAL");
  });

  it("exposes angle, font size and colour and sends them to the service", async () => {
    await render(<WatermarkDialog open onClose={() => {}} currentFile={file} />);
    expect(document.getElementById("watermark-angle")).toBeTruthy();
    const size = document.getElementById("watermark-font-size") as HTMLInputElement;
    const color = document.getElementById("watermark-color") as HTMLInputElement;
    const angle = document.getElementById("watermark-angle") as HTMLInputElement;
    await act(async () => {
      setValue(size, "40");
      setValue(color, "#ff0000");
      setValue(angle, "30");
    });
    await act(async () => {
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const arg = (mutateAsync.mock.calls[0] as unknown as [{ options: Record<string, unknown> }])[0];
    expect(arg.options).toMatchObject({
      text: "CONFIDENTIAL",
      position: "center-diagonal",
      fontSize: 40,
      color: [1, 0, 0],
      rotation: 30,
      opacity: 0.25,
    });
  });

  it("angle follows the preset until the user sets it, and Apply is blocked on a bad font size", async () => {
    await render(<WatermarkDialog open onClose={() => {}} currentFile={file} />);
    const angle = document.getElementById("watermark-angle") as HTMLInputElement;
    const position = document.querySelector("select") as HTMLSelectElement;
    expect(angle.value).toBe("45");
    await act(async () => setValue(position, "top-left"));
    expect(angle.value).toBe("0");
    await act(async () => setValue(angle, "15"));
    await act(async () => setValue(position, "footer"));
    expect(angle.value).toBe("15"); // user's choice is kept
    const size = document.getElementById("watermark-font-size") as HTMLInputElement;
    await act(async () => setValue(size, "9999"));
    const apply = [...document.querySelectorAll("button[type=submit]")][0] as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/between 1 and 500/);
  });
});
