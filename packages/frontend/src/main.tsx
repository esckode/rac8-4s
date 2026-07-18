import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ServiceUnavailableProvider } from './context/ServiceUnavailableContext'
import { OfflineSnapshotProvider } from './pwa/OfflineSnapshotContext'
import { initPwa } from './pwa/register'
import { initSwBridge } from './pwa/sw-bridge'
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
      <OfflineSnapshotProvider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </OfflineSnapshotProvider>
    </ServiceUnavailableProvider>
  </React.StrictMode>
)

initPwa()
initSwBridge()
