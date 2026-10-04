import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * The editor must not call routes that do not exist on PlugYard's backend or on
 * the static host: they can only 404 and surface as errors. Sharing was never
 * built here; there is no Google-fonts proxy. This guard keeps them out.
 */
const DEAD = [/\/api\/v1\/sharing/, /\/api\/share\/notify/, /\/api\/fonts\/google/]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

describe("dead editor routes", () => {
  it("no source file requests a sharing / share-notify / google-fonts route", () => {
    const offenders: string[] = []
    for (const file of files(join(process.cwd(), "src"))) {
      const text = readFileSync(file, "utf8")
      // comments that explain the removal are fine; look for the route inside code only
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
      for (const re of DEAD) if (re.test(code)) offenders.push(`${file} -> ${re}`)
    }
    expect(offenders).toEqual([])
  })

  it("the share dialog component is gone", () => {
    expect(() => statSync(join(process.cwd(), "src/components/sharing"))).toThrow()
  })
})
