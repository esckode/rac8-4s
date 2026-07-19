import { isSwMessage, type AppMessage, type SwMessage } from '../workers/sw-lib/messages'

type ReplayResultMessage = Extract<SwMessage, { type: 'REPLAY_RESULT' }>
type ReplayListener = (message: ReplayResultMessage) => void

const replayListeners = new Set<ReplayListener>()

function postToSW(message: AppMessage): void {
  navigator.serviceWorker?.controller?.postMessage(message)
}

function handleSwMessage(event: MessageEvent): void {
  const data = event.data
  if (isSwMessage(data) && data.type === 'REPLAY_RESULT') {
    replayListeners.forEach((listener) => listener(data))
  }
}

/** Subscribes to SW→app REPLAY_RESULT fan-out (§0.6). Returns an unsubscribe fn. */
export function subscribeReplayResults(listener: ReplayListener): () => void {
  replayListeners.add(listener)
  return () => {
    replayListeners.delete(listener)
  }
}

/**
 * Wires the replay triggers that don't depend on Background Sync (iOS Safari
 * has none): connectivity regain and app start once the SW is ready. Call
 * once, e.g. alongside initPwa().
 */
export function initSwBridge(): void {
  if (!('serviceWorker' in navigator)) return

  navigator.serviceWorker.addEventListener('message', handleSwMessage)
  window.addEventListener('online', () => postToSW({ type: 'REPLAY_QUEUE' }))
  navigator.serviceWorker.ready.then(() => postToSW({ type: 'REPLAY_QUEUE' }))
}

/** Third replay trigger (§0.6): call after a successful login. */
export function notifyLogin(): void {
  postToSW({ type: 'REPLAY_QUEUE' })
}

/**
 * Requests the SW wipe the venue cache + sync queue (D5), resolving once it
 * replies WIPE_DONE. Falls back to a 1.5s timeout so a slow/unresponsive SW
 * never blocks sign-out.
 */
export function wipePlayerData(): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }

    const controller = navigator.serviceWorker?.controller
    if (!controller) {
      finish()
      return
    }

    const handler = (event: MessageEvent) => {
      if (isSwMessage(event.data) && event.data.type === 'WIPE_DONE') {
        cleanupAndFinish()
      }
    }
    let timer: ReturnType<typeof setTimeout>
    const cleanupAndFinish = () => {
      clearTimeout(timer)
      navigator.serviceWorker.removeEventListener('message', handler)
      finish()
    }
    navigator.serviceWorker.addEventListener('message', handler)
    controller.postMessage({ type: 'WIPE_PLAYER_DATA' } satisfies AppMessage)

    timer = setTimeout(cleanupAndFinish, 1500)
  })
}
