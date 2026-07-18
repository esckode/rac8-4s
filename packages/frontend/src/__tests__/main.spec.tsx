/// <reference types="@testing-library/jest-dom" />

const registerMock = jest.fn().mockResolvedValue({ scope: '/' })

jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({ render: jest.fn() })),
}))
jest.mock('../App', () => ({ __esModule: true, default: () => null }))
jest.mock('../context/ServiceUnavailableContext', () => ({
  ServiceUnavailableProvider: ({ children }: { children: unknown }) => children,
}))
jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn(),
  QueryClientProvider: ({ children }: { children: unknown }) => children,
}))
jest.mock('../pwa/register', () => ({
  initPwa: jest.fn(),
}))
jest.mock('../pwa/sw-bridge', () => ({
  initSwBridge: jest.fn(),
}))

describe('main entry point', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    document.body.innerHTML = '<div id="root"></div>'
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: { register: registerMock },
      configurable: true,
    })
  })

  it('initializes the PWA via pwa/register.initPwa(), not a hand-rolled navigator.serviceWorker.register', async () => {
    await import('../main')
    const { initPwa } = await import('../pwa/register')

    expect(initPwa).toHaveBeenCalledTimes(1)
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('wires up the SW bridge (initSwBridge) so replay results and reconnect triggers work', async () => {
    await import('../main')
    const { initSwBridge } = await import('../pwa/sw-bridge')

    expect(initSwBridge).toHaveBeenCalledTimes(1)
  })

  it('throws if the root element is missing', async () => {
    document.body.innerHTML = ''

    await expect(import('../main')).rejects.toThrow('Root element not found')
  })
})
