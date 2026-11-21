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
    port: 5182,
    strictPort: true,
    // The real service serves /v1/**; the app calls it as /api/v1/**.
    proxy: {
      '/api': {
        target: 'http://localhost:8083',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: { port: 5182, strictPort: true },
}))
