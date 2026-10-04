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

  it("disposes an evicted canvas exactly once even when its host releases it later", async () => {
    const pool = new PageRenderPool({ fabric, maxLive: 1 });
    const first = await pool.acquire(0, host().el);
    await pool.acquire(1, host().el); // evicts + disposes `first`
    expect(first.dispose).toHaveBeenCalledOnce();
    pool.release(0, first); // the old host's unmount cleanup
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(pool.freeCount).toBe(0); // a disposed canvas is never recycled
    pool.dispose();
    expect(first.dispose).toHaveBeenCalledOnce();
  });

  it("swallows a rejected or throwing dispose instead of leaking an unhandled rejection", async () => {
    const pool = new PageRenderPool({ fabric });
    const a = await pool.acquire(0, host().el);
    const b = await pool.acquire(1, host().el);
    (a.dispose as unknown as ReturnType<typeof vi.fn>).mockReturnValue(Promise.reject("aborted"));
    (b.dispose as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("NotFoundError");
    });
    pool.dispose(); // must not throw; an unhandled rejection would fail this run
    await new Promise((r) => setTimeout(r, 0));
    expect(a.dispose).toHaveBeenCalledOnce();
    expect(b.dispose).toHaveBeenCalledOnce();
  });
});

describe("page canvas ownership with the real Fabric", () => {
  it("evict + stale release + pool dispose leave no unhandled 'aborted' rejection", async () => {
    const real = await import("fabric");
    const pool = new PageRenderPool({ fabric: real as unknown as typeof Fabric, maxLive: 1 });
    const h0 = host();
    const c0 = await pool.acquire(0, h0.el);
    c0.requestRenderAll(); // a pending render makes Fabric's dispose wait
    await pool.acquire(1, host().el); // evicts c0
    h0.mount.remove(); // host unmount
    pool.release(0, c0); // its stale release used to dispose a second time
    pool.dispose();
    await new Promise((r) => setTimeout(r, 100));
    // vitest fails the run on an unhandled rejection, so reaching here is the assertion
    expect(pool.liveCount).toBe(0);
  });
});
