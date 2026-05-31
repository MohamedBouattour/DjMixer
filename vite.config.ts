import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  base: '/mixer/',
  define: {
    '__BUILD_DATE__': JSON.stringify(new Date().toISOString())
  },
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
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  }
})
