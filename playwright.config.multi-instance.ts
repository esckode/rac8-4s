/**
 * Playwright configuration for the messaging-multi-instance test project.
 *
 * This project validates distributed behaviour: cross-node SSE, cross-instance auth,
 * and BullMQ job processing.  It targets the load balancer (:4000) in front of two
 * API instances (:3001 / :3002) and requires the distributed stack to be running:
 *
 *   npm run dev:distributed
 *
 * It is deliberately SEPARATE from the default playwright.config.ts so that the
 * normal single-instance suite can run in CI without Redis / LB / 2nd API instance.
 * Run this project manually:
 *
 *   npx playwright test --config playwright.config.multi-instance.ts
 *   npx playwright test --config playwright.config.multi-instance.ts --retries=2
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './packages/frontend/e2e/multi-instance',
  fullyParallel: false, // Sequential — topology has fixed ports; parallel hits the same LB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report-multi-instance' }]],
  use: {
    // Tests talk directly to the API via fetch (no browser UI needed for most scenarios)
    baseURL: 'http://localhost:4000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'messaging-multi-instance',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // No webServer: the distributed stack is started externally via dev:distributed.
  // Tests assert the LB is reachable in their beforeAll and fail fast with a clear
  // error if the topology is not up.
})
