import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Part D: SEO texts are read at build time, with built-in fallbacks.

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test/api")
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("pageMetadata", () => {
  it("falls back to the built-in texts when the API is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")))
    const { pageMetadata } = await import("./seo")
    const m = await pageMetadata("pro", { alternates: { canonical: "https://plugyard.com/pro/" } })
    expect(m.title).toBe("PlugYard Pro")
    expect(m.alternates).toEqual({ canonical: "https://plugyard.com/pro/" })
  })

  it("uses the admin's texts; an empty description means the site description", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        texts: { "seo.page.pro.title": "Go Pro", "seo.page.pro.description": "", "seo.description": "Site words" },
      }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const { pageMetadata } = await import("./seo")
    const m = await pageMetadata("pro")
    expect(m.title).toBe("Go Pro")
    expect(m.description).toBe("Site words")
    await pageMetadata("login")
    expect(fetchMock).toHaveBeenCalledTimes(1) // once per build
  })
})
