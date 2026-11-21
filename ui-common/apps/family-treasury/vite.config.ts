import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

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
    port: 5187,
    strictPort: true,
    proxy: {
      // The backend serves /v1/...; the app calls /api/v1/... so the browser stays same-origin in dev.
      '/api': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
}))
