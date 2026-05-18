import '@testing-library/jest-dom'
import 'jest-axe/extend-expect'

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

declare global {
  interface ImportMeta {
    env: {
      REACT_APP_API_BASE?: string
      [key: string]: string | undefined
    }
  }
}
