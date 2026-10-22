import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Mirror the application's active source alias for component tests.
const src = fileURLToPath(new URL("./src", import.meta.url))

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${src}/` }],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
})
