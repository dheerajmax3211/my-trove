import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// One Vitest run covers every workspace package. The `@platform/source` condition makes
// workspace packages resolve to their TypeScript source, so tests never need a prior build.
export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ['@platform/source', 'module', 'browser', 'development'] },
  ssr: { resolve: { conditions: ['@platform/source', 'module', 'browser', 'development'] } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'apps/*/src/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    restoreMocks: true,
    clearMocks: true,
  },
})
