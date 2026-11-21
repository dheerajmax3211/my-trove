import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

const BACKEND = 'http://localhost:8085'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    // Dev: resolve workspace packages to their TypeScript source for instant HMR.
    // Build: resolve their published `dist` output, which proves the packages build and export correctly.
    conditions:
      command === 'serve'
        ? ['@platform/source', ...defaultClientConditions]
        : [...defaultClientConditions],
  },
  server: {
    port: 5184,
    strictPort: true,
    proxy: {
      // The home-pulse service serves /v1/*; the browser calls /api/v1/* (same origin, no CORS setup).
      '/api': {
        target: BACKEND,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: { port: 5184, strictPort: true },
}))
