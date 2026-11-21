import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildCss } from '../src/css'

const target = fileURLToPath(new URL('../tokens.css', import.meta.url))
writeFileSync(target, buildCss())
console.log(`wrote ${target}`)
