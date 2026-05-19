import { closeTestDb } from './db-test-setup'

declare global {
  var __jest_setup_done__: boolean
}

// Only register global hooks once, not per test file
if (!global.__jest_setup_done__) {
  afterAll(async () => {
    await closeTestDb()
  })

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise rejection in test:', reason)
  })

  global.__jest_setup_done__ = true
}
