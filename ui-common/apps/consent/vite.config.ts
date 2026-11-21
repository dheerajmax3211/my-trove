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
    port: 5183,
    strictPort: true,
    proxy: {
      // The browser calls /api/v1/...; the consent gateway serves /v1/..., so strip the prefix.
      '/api': {
        target: 'http://localhost:8084',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
}))
