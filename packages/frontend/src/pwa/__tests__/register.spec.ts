const registerSWMock = jest.fn()

describe('pwa/register', () => {
  beforeEach(() => {
    jest.resetModules()
    registerSWMock.mockReset()
    jest.doMock('virtual:pwa-register', () => ({
      registerSW: (...args: unknown[]) => registerSWMock(...args),
    }))
  })

  it('registers the SW with immediate:true and an onNeedRefresh hook', async () => {
    registerSWMock.mockReturnValue(jest.fn())
    const { initPwa } = await import('../register')

    initPwa()

    expect(registerSWMock).toHaveBeenCalledWith(
      expect.objectContaining({ immediate: true, onNeedRefresh: expect.any(Function) })
    )
  })

  it('flips getUpdateAvailable() and notifies subscribers when onNeedRefresh fires', async () => {
    let onNeedRefresh: () => void = () => {}
    registerSWMock.mockImplementation((opts: { onNeedRefresh: () => void }) => {
      onNeedRefresh = opts.onNeedRefresh
      return jest.fn()
    })
    const { initPwa, getUpdateAvailable, subscribe } = await import('../register')
    initPwa()
    const listener = jest.fn()
    subscribe(listener)

    expect(getUpdateAvailable()).toBe(false)
    onNeedRefresh()

    expect(getUpdateAvailable()).toBe(true)
    expect(listener).toHaveBeenCalled()
  })

  it('applyUpdate() calls the registered updateSW function with reloadPage=true', async () => {
    const updateSW = jest.fn()
    registerSWMock.mockReturnValue(updateSW)
    const { initPwa, applyUpdate } = await import('../register')
    initPwa()

    applyUpdate()

    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('applyUpdate() is a no-op before initPwa() has run', async () => {
    const { applyUpdate } = await import('../register')

    expect(() => applyUpdate()).not.toThrow()
  })

  it('subscribe() returns an unsubscribe function that stops future notifications', async () => {
    let onNeedRefresh: () => void = () => {}
    registerSWMock.mockImplementation((opts: { onNeedRefresh: () => void }) => {
      onNeedRefresh = opts.onNeedRefresh
      return jest.fn()
    })
    const { initPwa, subscribe } = await import('../register')
    initPwa()
    const listener = jest.fn()
    const unsubscribe = subscribe(listener)
    unsubscribe()

    onNeedRefresh()

    expect(listener).not.toHaveBeenCalled()
  })
})
