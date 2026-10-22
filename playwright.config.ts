import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "python -m http.server 4173 --directory out",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop-edge", use: { ...devices["Desktop Chrome"], channel: "msedge" } },
    { name: "mobile-edge", use: { ...devices["iPhone 13"], browserName: "chromium", channel: "msedge" } },
  ],
})
