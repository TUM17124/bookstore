// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEmbeddedFonts, type UseEmbeddedFontsResult } from "./use-embedded-fonts";
import type { FontCache } from "../utils/font-cache";

const meta = (fontId: string, isEmbedded: boolean) => ({
  fontId,
  originalName: `ABCDEF+Font${fontId}`,
  postscriptName: `Font${fontId}`,
  fontFamily: `Font${fontId}`,
  subtype: "TrueType",
  isEmbedded,
  isSubset: true,
  format: "ttf" as const,
  sizeBytes: 10,
});

const cache = {
  getEntry: vi.fn(async () => null),
  set: vi.fn(async () => {}),
  delete: vi.fn(async () => {}),
} as unknown as FontCache;

let root: Root | null = null;
let el: HTMLDivElement | null = null;
let latest: UseEmbeddedFontsResult | null = null;

function Probe(props: Parameters<typeof useEmbeddedFonts>[0]) {
  latest = useEmbeddedFonts(props);
  return null;
}

beforeEach(() => {
  latest = null;
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  vi.unstubAllGlobals();
});

async function mount(props: Parameters<typeof useEmbeddedFonts>[0]) {
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(<Probe {...props} />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

describe("fonts that are not embedded", () => {
  it("make no request to a Google-fonts route and fall back to local fonts without an error", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchSpy);
    const fetchFontData = vi.fn(async () => {
      throw new Error("Font bytes are not extractable");
    });
    await mount({
      documentId: "doc1",
      cache,
      fetchFontList: async () => ({ fonts: [meta("a1", false), meta("b2", true)] }),
      fetchFontData,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(latest!.error).toBeNull(); // the list itself loaded fine: no error state for the UI
    expect(latest!.fonts.map((f) => f.status)).toEqual(["failed", "failed"]);
    for (const f of latest!.fonts) {
      expect(f.error).toMatch(/local font/);
      expect(f.error).not.toMatch(/google/i);
    }
    // only the embedded one tried to read bytes; the other never hit the network
    expect(fetchFontData).toHaveBeenCalledTimes(1);
    // lookups degrade to "no match" (the renderer then uses its own fallback fonts)
    expect(latest!.getFontFaceName("ABCDEF+Fonta1")).toBeNull();
  });

  it("still uses an injected substitute-font lookup when a host provides one", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const lookup = vi.fn(async () => ({ found: false as const }));
    await mount({
      documentId: "doc2",
      cache,
      fetchFontList: async () => ({ fonts: [meta("c3", false)] }),
      fetchFontData: async () => {
        throw new Error("n/a");
      },
      fetchGoogleFont: lookup,
    });
    expect(lookup).toHaveBeenCalledWith("ABCDEF+Fontc3");
  });
});
