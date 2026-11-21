// Guards the "exact pins, one version per dependency" convention across the workspace.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifests = [join(root, 'package.json')]
for (const group of ['packages', 'apps']) {
  const dir = join(root, group)
  if (!existsSync(dir)) continue
  for (const name of readdirSync(dir)) {
    const file = join(dir, name, 'package.json')
    if (existsSync(file)) manifests.push(file)
  }
}

const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/
const problems = []
const seen = new Map() // dep -> { version, where }

for (const file of manifests) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [dep, version] of Object.entries(pkg[field] ?? {})) {
      const where = `${pkg.name} (${field})`
      if (version === 'workspace:*') continue
      if (!EXACT.test(version)) problems.push(`${where}: ${dep}@${version} is not an exact version`)
      const prior = seen.get(dep)
      if (prior && prior.version !== version)
        problems.push(`${dep}: ${prior.version} in ${prior.where} but ${version} in ${where}`)
      else seen.set(dep, { version, where })
    }
  }
}

if (problems.length > 0) {
  console.error(`Dependency convention violations:\n  - ${problems.join('\n  - ')}`)
  process.exit(1)
}
console.log(
  `check-versions: ${seen.size} dependencies across ${manifests.length} manifests are exact and consistent`,
)
