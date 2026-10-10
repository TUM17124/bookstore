/**
 * SEO rules: which pages must be indexable, which must not be, and
 * sitemap / robots.txt hygiene.
 *
 * Run with: npx vitest run src/lib/seo-rules.test.ts
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import { resolve } from "path"

// ── helpers ──────────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, "../..")

function readPublic(name: string) {
  return readFileSync(resolve(ROOT, "public", name), "utf-8")
}

function robotsOf(noindex: boolean | undefined) {
  if (noindex === false) return "index:false"
  if (noindex === true) return "index:true (explicit)"
  return "inherited (index:true)"
}

// Statically import page metadata without running Next.js — read the source
// and extract the robots field via a simple regex that matches the literal
// in the TypeScript file.
function pageRobotsIndex(relPath: string): boolean | null {
  const src = readFileSync(resolve(ROOT, "src/app", relPath, "page.tsx"), "utf-8")
  // Match: robots: { index: false … } or robots: { index: true … }
  const m = src.match(/robots\s*:\s*\{[^}]*index\s*:\s*(true|false)/)
  if (!m) return null  // not set explicitly → inherits root layout (true)
  return m[1] === "true"
}

// ── Public pages that MUST be indexable ──────────────────────────────────────

const PUBLIC_MUST_INDEX = [
  ".",          // home /
  "pro",
  "terms",
  "terms-of-use",
  "refund-policy",
  "privacy",
  "tools/pdf-editor",
]

describe("public pages must allow indexing", () => {
  for (const page of PUBLIC_MUST_INDEX) {
    it(`${page || "/"} is not noindex`, () => {
      const idx = pageRobotsIndex(page)
      // null = inherits root (index:true), true = explicitly set to true
      // false = bug — would block indexing
      expect(idx, `${page}/page.tsx sets robots.index=false — this is a public page`).not.toBe(false)
    })
  }
})

// ── Private pages that MUST have noindex ─────────────────────────────────────

const PRIVATE_MUST_NOINDEX = [
  "bookmarks",
  "checkout",
  "dashboard",
  "publish",
  "purchases",
  "settings",
  "verify-email",
  "reset-password",
  "forgot-password",
]

describe("private pages must have noindex", () => {
  for (const page of PRIVATE_MUST_NOINDEX) {
    it(`${page} has robots.index=false`, () => {
      const idx = pageRobotsIndex(page)
      expect(idx, `${page}/page.tsx must set robots.index=false`).toBe(false)
    })
  }
})

// ── Sitemap must not contain private or noindex pages ────────────────────────

describe("sitemap.xml", () => {
  const sitemap = readPublic("sitemap.xml")

  it("does not list ?category= query-string URLs (they are alternates of /)", () => {
    expect(sitemap).not.toContain("?category=")
  })

  it("does not list private pages", () => {
    const privatePaths = ["/bookmarks", "/checkout", "/dashboard", "/publish", "/purchases", "/settings"]
    for (const p of privatePaths) {
      expect(sitemap, `sitemap must not include private page ${p}`).not.toContain(`plugyard.com${p}`)
    }
  })

  it("lists all public canonical URLs with trailing slash", () => {
    const required = [
      "https://plugyard.com/",
      "https://plugyard.com/pro/",
      "https://plugyard.com/tools/pdf-editor/",
      "https://plugyard.com/terms/",
      "https://plugyard.com/terms-of-use/",
      "https://plugyard.com/refund-policy/",
      "https://plugyard.com/privacy/",
      "https://plugyard.com/login/",
      "https://plugyard.com/signup/",
    ]
    for (const url of required) {
      expect(sitemap, `sitemap must include ${url}`).toContain(`<loc>${url}</loc>`)
    }
  })

  it("does not list the defunct /login-merchant/ redirect target", () => {
    expect(sitemap).not.toContain("login-merchant")
  })

  it("uses only https:// URLs", () => {
    const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
    for (const loc of locs) {
      expect(loc, `sitemap URL must use https`).toMatch(/^https:\/\//)
    }
  })

  it("uses only plugyard.com (no www, no bare domain)", () => {
    expect(sitemap).not.toMatch(/www\.plugyard\.com/)
  })
})

// ── robots.txt hygiene ───────────────────────────────────────────────────────

describe("robots.txt", () => {
  const robots = readPublic("robots.txt")

  it("allows / for all bots", () => {
    expect(robots).toMatch(/Allow:\s*\//)
  })

  it("references the canonical sitemap URL", () => {
    expect(robots).toContain("Sitemap: https://plugyard.com/sitemap.xml")
  })

  it("disallows /admin/ and /api/ (backend paths)", () => {
    expect(robots).toContain("Disallow: /admin/")
    expect(robots).toContain("Disallow: /api/")
  })

  it("does not disallow private app pages — those use noindex instead", () => {
    // Blocking a page in robots.txt prevents Google from seeing the noindex tag.
    // Private pages are kept out of the index via <meta name="robots" content="noindex">.
    const shouldNotBlock = ["/bookmarks/", "/checkout/", "/dashboard/", "/publish/", "/purchases/", "/settings/"]
    for (const p of shouldNotBlock) {
      expect(robots, `robots.txt must NOT disallow ${p} — use noindex on the page instead`).not.toContain(`Disallow: ${p}`)
    }
  })
})
