import { closeTestPool } from './helpers/db'

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
