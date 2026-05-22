declare global {
  var __jest_setup_done__: boolean
}

// Only register global hooks once, not per test file
if (!(global as any).__jest_setup_done__) {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise rejection in test:', reason)
  })

  ;(global as any).__jest_setup_done__ = true
}

export {}
