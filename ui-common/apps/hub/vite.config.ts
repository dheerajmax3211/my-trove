import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5181,
    strictPort: true,
    // /api/auth/v1/me -> http://localhost:8081/v1/me ; /api/shared/v1/households -> http://localhost:8082/v1/households
    proxy: {
      '/api/auth': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth/, ''),
      },
      '/api/shared': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/shared/, ''),
      },
    },
  },
  preview: { port: 5181, strictPort: true },
  resolve: {
    // Dev: resolve workspace packages to their TypeScript source for instant HMR.
    // Build: resolve their published `dist` output, which proves the packages build and export correctly.
    conditions:
      command === 'serve'
        ? ['@platform/source', ...defaultClientConditions]
        : [...defaultClientConditions],
  },
}))
