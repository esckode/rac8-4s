import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ServiceUnavailableProvider } from './context/ServiceUnavailableContext'
import './styles/globals.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

const queryClient = new QueryClient()
const root = createRoot(rootElement)

root.render(
  <React.StrictMode>
    <ServiceUnavailableProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ServiceUnavailableProvider>
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
