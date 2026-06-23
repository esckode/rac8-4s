import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './packages/frontend/e2e',
  // TEMPLATE.spec.ts is a copy-this scaffold for new specs, not a real test.
  testIgnore: '**/TEMPLATE.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Retry locally too (not just CI): the real-time SSE specs are timing-sensitive and
  // flake under parallel local workers. Measured equally flaky regardless of DB schema,
  // so retries — not a code change — are the right mitigation. CI already ran with 2.
  retries: 2,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  webServer: {
    command: 'npm run dev --workspace=packages/frontend',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },

  // Note: API server (port 3001) must be running separately
  // For E2E tests, start it with: npm run dev --workspace=packages/api
  // Or use Docker: docker compose up -d postgres && npm run dev --workspace=packages/api
})
