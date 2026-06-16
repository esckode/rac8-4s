import { closeTestPool } from './helpers/db'

// Default per-test timeout for this project. Set here (not via the config's
// testTimeout option) because testTimeout is a global/root option that Jest does
// not recognize in a per-project config under the root `projects` array.
jest.setTimeout(30000)

// Set LOG_LEVEL for testing logger.ts coverage
if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL = 'debug'
}

declare global {
  var __jest_setup_done__: boolean
}

// Only register global hooks once, not per test file
if (!(global as any).__jest_setup_done__) {
  // Initialize test pool (runs migrations on first call)
  beforeAll(async () => {
    const { getTestPool } = await import('./helpers/db')
    await getTestPool()
  })

  // Cleanup global resources
  afterAll(async () => {
    await closeTestPool()
  })

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise rejection in test:', reason)
  })

  ;(global as any).__jest_setup_done__ = true
}

export {}
