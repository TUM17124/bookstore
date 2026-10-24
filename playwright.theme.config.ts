import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'theme-contrast.spec.ts',
  timeout: 90_000,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: process.env.THEME_TEST_URL || 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'edge', use: { ...devices['Desktop Chrome'], channel: 'msedge' } }],
})
