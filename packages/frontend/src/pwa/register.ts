import { registerSW } from 'virtual:pwa-register'

type Listener = () => void

let updateAvailable = false
let applyUpdateFn: (() => void) | null = null
const listeners = new Set<Listener>()

function notify(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Wires up the built service worker via vite-plugin-pwa's virtual module
 * (registerType: 'prompt' — D9). No skipWaiting/clients.claim happens
 * automatically; the app surfaces `updateAvailable` and calls applyUpdate()
 * only when the player taps the refresh toast (UpdateToast, S5c).
 */
export function initPwa(): void {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateAvailable = true
      notify()
    },
  })
  applyUpdateFn = () => {
    void updateSW(true)
  }
}

export function getUpdateAvailable(): boolean {
  return updateAvailable
}

export function applyUpdate(): void {
  applyUpdateFn?.()
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
