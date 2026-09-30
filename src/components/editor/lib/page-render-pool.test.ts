// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Fabric from "fabric";
vi.mock("@giga-pdf/canvas", () => ({ PDFRenderer: class {} }));
vi.mock("@/lib/pdf-editor/client-logger", () => ({ clientLogger: { warn: vi.fn() } }));
import { PageRenderPool } from "./page-render-pool";

class Canvas {
  wrapperEl = document.createElement("div");
  upperCanvasEl = document.createElement("canvas");
  clear = vi.fn();
  dispose = vi.fn();
  constructor(public lowerCanvasEl: HTMLCanvasElement) {
    lowerCanvasEl.replaceWith(this.wrapperEl);
    this.wrapperEl.append(lowerCanvasEl, this.upperCanvasEl);
  }
}
function host() {
  const mount = document.createElement("div");
  const el = document.createElement("canvas");
  mount.append(el);
  document.body.append(mount);
  return { mount, el };
}
const fabric = { Canvas } as unknown as typeof Fabric;
afterEach(() => document.body.replaceChildren());

describe("page canvas ownership", () => {
  it("recycles the whole wrapper without leaving empty page-height boxes", async () => {
    const pool = new PageRenderPool({ fabric });
    const first = host();
    const canvas = await pool.acquire(0, first.el);
    pool.release(0, canvas);
    const second = host();
    expect(await pool.acquire(1, second.el)).toBe(canvas);
    expect(first.mount.childElementCount).toBe(0);
    expect(second.mount.firstElementChild).toBe(canvas.wrapperEl);
    expect(second.mount.querySelectorAll("canvas")).toHaveLength(2);
    pool.dispose();
  });

  it("does not let a cancelled render release a remounted page's canvas", async () => {
    const pool = new PageRenderPool({ fabric });
    const old = await pool.acquire(0, host().el);
    const current = await pool.acquire(0, host().el);
    expect(current).not.toBe(old);
    pool.release(0, old);
    expect(pool.liveCount).toBe(1);
    expect(current.clear).not.toHaveBeenCalled();
    expect(old.dispose).toHaveBeenCalledOnce();
    pool.release(0, current);
    expect(pool.freeCount).toBe(1);
    pool.dispose();
  });
});
