import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

// Dev-only harness: serves ./harness with workspace packages resolved to their TypeScript source.
export default defineConfig({
  root: 'harness',
  plugins: [react()],
  resolve: { conditions: ['@platform/source', ...defaultClientConditions] },
  server: { port: 5192, strictPort: true },
})
