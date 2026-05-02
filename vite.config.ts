import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 'worklets/scratch-processor.js'],
      manifest: {
        name: 'DJ Controller',
        short_name: 'DJ Mix',
        description: 'Professional DJ controller web app',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      // Proxy all API requests to the VPS (VM)
      '/api': {
        target: 'http://79.137.14.75:3002',
        changeOrigin: true,
        secure: false
      },
      '/search': {
        target: 'http://79.137.14.75:3002',
        changeOrigin: true,
        secure: false
      },
      '/stream': {
        target: 'http://79.137.14.75:3002',
        changeOrigin: true,
        secure: false
      },
      '/auth': {
        target: 'http://79.137.14.75:3002',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
