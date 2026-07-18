import { subscribeReplayResults, initSwBridge, notifyLogin, wipePlayerData } from '../sw-bridge'
import type { SwMessage } from '../../workers/sw-lib/messages'

function installServiceWorkerContainer(controllerOverride: unknown = { postMessage: jest.fn() }) {
  const listeners: Record<string, ((event: MessageEvent) => void)[]> = {}
  const container = {
    controller: controllerOverride,
    ready: Promise.resolve({ active: controllerOverride }),
    addEventListener: jest.fn((type: string, listener: (event: MessageEvent) => void) => {
      listeners[type] = listeners[type] || []
      listeners[type].push(listener)
    }),
    removeEventListener: jest.fn((type: string, listener: (event: MessageEvent) => void) => {
      listeners[type] = (listeners[type] || []).filter((l) => l !== listener)
    }),
  }
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true })
  return {
    container,
    controller: controllerOverride as { postMessage: jest.Mock },
    emit: (type: string, data: unknown) => {
      (listeners[type] || []).forEach((l) => l({ data } as MessageEvent))
    },
  }
}

describe('sw-bridge', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  describe('subscribeReplayResults', () => {
    it('fans out REPLAY_RESULT messages to subscribers', () => {
      const { emit } = installServiceWorkerContainer()
      initSwBridge()
      const listener = jest.fn()
      subscribeReplayResults(listener)

      const message: SwMessage = { type: 'REPLAY_RESULT', outcome: 'success', tournamentId: 't1', matchId: 'm1' }
      emit('message', message)

      expect(listener).toHaveBeenCalledWith(message)
    })

    it('ignores non-REPLAY_RESULT SW messages', () => {
      const { emit } = installServiceWorkerContainer()
      initSwBridge()
      const listener = jest.fn()
      subscribeReplayResults(listener)

      emit('message', { type: 'WIPE_DONE' })

      expect(listener).not.toHaveBeenCalled()
    })

    it('ignores malformed messages', () => {
      const { emit } = installServiceWorkerContainer()
      initSwBridge()
      const listener = jest.fn()
      subscribeReplayResults(listener)

      emit('message', { bogus: true })

      expect(listener).not.toHaveBeenCalled()
    })

    it('stops notifying after unsubscribe', () => {
      const { emit } = installServiceWorkerContainer()
      initSwBridge()
      const listener = jest.fn()
      const unsubscribe = subscribeReplayResults(listener)
      unsubscribe()

      emit('message', { type: 'REPLAY_RESULT', outcome: 'success', tournamentId: 't1', matchId: 'm1' })

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('replay triggers', () => {
    it('posts REPLAY_QUEUE to the controller once the SW is ready (init)', async () => {
      const { controller } = installServiceWorkerContainer()
      initSwBridge()
      await Promise.resolve()
      await Promise.resolve()

      expect(controller.postMessage).toHaveBeenCalledWith({ type: 'REPLAY_QUEUE' })
    })

    it('posts REPLAY_QUEUE to the controller on window online', () => {
      const { controller } = installServiceWorkerContainer()
      initSwBridge()
      controller.postMessage.mockClear()

      window.dispatchEvent(new Event('online'))

      expect(controller.postMessage).toHaveBeenCalledWith({ type: 'REPLAY_QUEUE' })
    })

    it('notifyLogin() posts REPLAY_QUEUE to the controller', () => {
      const { controller } = installServiceWorkerContainer()
      initSwBridge()
      controller.postMessage.mockClear()

      notifyLogin()

      expect(controller.postMessage).toHaveBeenCalledWith({ type: 'REPLAY_QUEUE' })
    })
  })

  describe('wipePlayerData', () => {
    it('resolves once the SW replies WIPE_DONE', async () => {
      const { controller, emit } = installServiceWorkerContainer()

      const promise = wipePlayerData()
      expect(controller.postMessage).toHaveBeenCalledWith({ type: 'WIPE_PLAYER_DATA' })

      emit('message', { type: 'WIPE_DONE' })

      await expect(promise).resolves.toBeUndefined()
    })

    it('resolves after 1.5s even if WIPE_DONE never arrives (never blocks sign-out)', async () => {
      jest.useFakeTimers()
      installServiceWorkerContainer()

      const promise = wipePlayerData()
      await jest.advanceTimersByTimeAsync(1500)

      await expect(promise).resolves.toBeUndefined()
    })

    it('resolves immediately when there is no controller (no SW yet)', async () => {
      installServiceWorkerContainer(null)

      await expect(wipePlayerData()).resolves.toBeUndefined()
    })
  })
})
