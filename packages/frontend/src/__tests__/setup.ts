import '@testing-library/jest-dom'
import 'jest-axe/extend-expect'

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// Mock import.meta for Vite features in Jest
Object.defineProperty(global, 'import', {
  value: {
    meta: {
      env: {
        MODE: 'test',
        REACT_APP_API_BASE: process.env.REACT_APP_API_BASE || '/api',
      },
    },
  },
  writable: true,
  configurable: true,
})

declare global {
  interface ImportMeta {
    env: {
      MODE?: string
      REACT_APP_API_BASE?: string
      [key: string]: string | undefined
    }
  }
}
