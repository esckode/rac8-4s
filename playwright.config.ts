import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './packages/frontend/e2e',
  // TEMPLATE.spec.ts is a copy-this scaffold for new specs, not a real test.
  // multi-instance/ specs require the distributed stack and live in their own config.
  testIgnore: ['**/TEMPLATE.spec.ts', '**/multi-instance/**'],
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
      // pwa-*.spec.ts need a production build (injectManifest SW + module-SW support) —
      // they run only on the `pwa` project below, against `vite preview`.
      // Project-level testIgnore replaces (does not merge with) the root config's, so
      // the root exclusions must be repeated here too.
      testIgnore: ['**/TEMPLATE.spec.ts', '**/multi-instance/**', '**/pwa-*.spec.ts'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      // Module service workers (devOptions type: 'module') don't run on Firefox dev;
      // the pwa project is chromium-only against the classic-built prod SW.
      // Project-level testIgnore replaces (does not merge with) the root config's, so
      // the root exclusions must be repeated here too.
      testIgnore: ['**/TEMPLATE.spec.ts', '**/multi-instance/**', '**/pwa-*.spec.ts'],
    },
    {
      name: 'pwa',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' },
      testMatch: '**/pwa-*.spec.ts',
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
