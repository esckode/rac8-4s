import React from 'react'
// @ts-expect-error - React 19 includes types but TypeScript may have issues
import ReactDOM from 'react-dom'
import App from './App'
import './styles/tokens.css'

const root = (ReactDOM as any).createRoot(document.getElementById('root') || document.body)

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Register Service Worker for offline-first functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.info('[ServiceWorker] Registered successfully', {
          scope: registration.scope,
        })
      })
      .catch((error) => {
        console.warn('[ServiceWorker] Registration failed', {
          message: error.message,
        })
      })
  })
}
