import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const external = [/^react(\/.*)?$/, /^react-dom(\/.*)?$/, /^radix-ui(\/.*)?$/]

// Library build: preserved ES modules (tree-shakeable) + one extracted stylesheet (dist/styles.css).
export default defineConfig({
  plugins: [react()],
  css: {
    modules: { generateScopedName: 'pp-[name]__[local]--[hash:base64:5]' },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      cssFileName: 'styles',
    },
    rollupOptions: {
      external,
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
})
