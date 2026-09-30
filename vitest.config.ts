import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Vitest had no config file, so it inherited no module resolution at all: any
// test (or module under test) that imports via the `@/` / `@giga-pdf/*` aliases
// failed with ERR_MODULE_NOT_FOUND. The existing suites only passed because
// they happen to be leaf modules with purely relative imports.
//
// These aliases mirror tsconfig.json's `paths` exactly - keep the two in sync.
const src = fileURLToPath(new URL("./src", import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@giga-pdf\/logger$/, replacement: `${src}/vendor/giga-pdf/logger/src/index.ts` },
      { find: /^@giga-pdf\/canvas$/, replacement: `${src}/vendor/giga-pdf/canvas/src/index.ts` },
      { find: /^@giga-pdf\/ui\/lib\/utils$/, replacement: `${src}/vendor/giga-pdf/ui/src/lib/utils.ts` },
      { find: /^@giga-pdf\/pdf-engine\/engine$/, replacement: `${src}/vendor/giga-pdf/pdf-engine/src/engine/index.ts` },
      { find: /^@giga-pdf\/pdf-engine\/parse$/, replacement: `${src}/vendor/giga-pdf/pdf-engine/src/parse/index.ts` },
      { find: /^@giga-pdf\/pdf-engine\/render$/, replacement: `${src}/vendor/giga-pdf/pdf-engine/src/render/index.ts` },
      { find: /^@giga-pdf\/pdf-engine\/merge-split$/, replacement: `${src}/vendor/giga-pdf/pdf-engine/src/merge-split/index.ts` },
      { find: /^@giga-pdf\/pdf-engine\/forms$/, replacement: `${src}/vendor/giga-pdf/pdf-engine/src/forms/index.ts` },
      { find: /^@giga-pdf\/pdf-engine\/encrypt$/, replacement: `${src}/vendor/giga-pdf/pdf-engine/src/encrypt/index.ts` },
      { find: /^@giga-pdf\/pdf-engine\/preview$/, replacement: `${src}/vendor/giga-pdf/pdf-engine/src/preview/index.ts` },
      { find: /^@giga-pdf\/pdf-engine\/convert$/, replacement: `${src}/vendor/giga-pdf/pdf-engine/src/convert/index.ts` },
      // Longest-prefix wins, so the specific @giga-pdf/* entries above must be
      // listed before these.
      { find: /^@giga-pdf\//, replacement: `${src}/vendor/giga-pdf/` },
      { find: /^@\//, replacement: `${src}/` },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
})
