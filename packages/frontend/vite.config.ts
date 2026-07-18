import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/workers',
      filename: 'service-worker.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'C.U.At.Court',
        short_name: 'CUAtCourt',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#2E8AD4',
        background_color: '#F0F3F8',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globIgnores: ['**/design.html', '**/design-system.html'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../../shared/src'),
      '@shared/': path.resolve(__dirname, '../../shared/src/'),
    },
  },
  server: {
    port: 5173,
    middlewareMode: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/tournaments': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/player': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/tournaments': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/player': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
