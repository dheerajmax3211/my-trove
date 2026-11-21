import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5186,
    strictPort: true,
    // The digital-legacy service listens on 8087; `/api/v1/legacy/...` becomes `/v1/legacy/...`.
    proxy: {
      '/api': {
        target: 'http://localhost:8087',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  resolve: {
    // Dev: resolve workspace packages to their TypeScript source for instant HMR.
    // Build: resolve their published `dist` output, which proves the packages build and export correctly.
    conditions:
      command === 'serve'
        ? ['@platform/source', ...defaultClientConditions]
        : [...defaultClientConditions],
  },
}))
