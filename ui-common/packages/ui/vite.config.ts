import { createHash } from 'node:crypto'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const external = [
  /^react(\/.*)?$/,
  /^react-dom(\/.*)?$/,
  /^radix-ui(\/.*)?$/,
  /^motion(\/.*)?$/,
  /^lenis(\/.*)?$/,
  /^gsap(\/.*)?$/,
  /^@platform\/tokens$/,
]

/**
 * Library mode inlines every asset, which would put ~300 KB of base64 fonts into styles.css.
 * Pull the fonts back out into dist/assets so the browser only fetches the subsets it needs
 * (the @font-face rules keep their unicode-range).
 */
function extractFonts(): Plugin {
  return {
    name: 'platform-ui:extract-fonts',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue
        const css =
          typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString()
        file.source = css.replace(
          /url\(["']?data:font\/(woff2?);base64,([A-Za-z0-9+/=]+)["']?\)/g,
          (_match, ext: string, data: string) => {
            const bytes = Buffer.from(data, 'base64')
            const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 10)
            const fileName = `assets/font-${hash}.${ext}`
            this.emitFile({ type: 'asset', fileName, source: bytes })
            return `url(./${fileName})`
          },
        )
      }
    },
  }
}

// Library build: preserved ES modules (tree-shakeable) + one extracted stylesheet (dist/styles.css).
export default defineConfig({
  plugins: [react(), extractFonts()],
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
