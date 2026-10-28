import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "../..")
const publicFile = (name: string) => readFileSync(resolve(root, "public", name))
const sha256 = (content: Buffer) => createHash("sha256").update(content).digest("hex")

describe("PlugYard application icon assets", () => {
  it("uses versioned current-brand assets in metadata, the PWA manifest, and notifications", () => {
    const layout = readFileSync(resolve(root, "src/app/layout.tsx"), "utf8")
    const manifest = JSON.parse(publicFile("manifest.webmanifest").toString("utf8")) as {
      icons: Array<{ src: string }>
    }
    const serviceWorker = publicFile("sw.js").toString("utf8")
    const expected = [
      "favicon-20261028.ico",
      "icon-192-20261028.png",
      "icon-512-20261028.png",
      "apple-touch-icon-20261028.png",
    ]

    for (const asset of expected) {
      expect(publicFile(asset).length, asset).toBeGreaterThan(0)
      expect(layout, asset).toContain(asset)
    }
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      "/icon-192-20261028.png",
      "/icon-512-20261028.png",
    ])
    expect(serviceWorker).toContain("/icon-192-20261028.png")
  })

  it("keeps cache-busted icons byte-identical to the approved current icon sources", () => {
    const pairs = [
      ["favicon.ico", "favicon-20261028.ico"],
      ["icon-192.png", "icon-192-20261028.png"],
      ["icon-512.png", "icon-512-20261028.png"],
      ["apple-touch-icon.png", "apple-touch-icon-20261028.png"],
    ] as const

    for (const [source, versioned] of pairs) {
      expect(sha256(publicFile(versioned)), versioned).toBe(sha256(publicFile(source)))
    }
  })
})
