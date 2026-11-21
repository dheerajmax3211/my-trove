/** Scope and key-path rules, mirroring the gateway's `Scope` (whole-segment matching). */

const PATH = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/
export const MAX_PATH_LENGTH = 255

export function isValidKeyPath(path: string): boolean {
  return path.length <= MAX_PATH_LENGTH && PATH.test(path)
}

export interface ParsedScope {
  path: string
  action: string
}

export function parseScope(scope: string): ParsedScope | null {
  const index = scope.lastIndexOf(':')
  if (index <= 0 || index === scope.length - 1) return null
  const path = scope.slice(0, index)
  const action = scope.slice(index + 1)
  return isValidKeyPath(path) && action === 'read' ? { path, action } : null
}

export function scopePath(scope: string): string {
  return parseScope(scope)?.path ?? scope
}

/** `profile.sizes` covers `profile.sizes` and `profile.sizes.shoe`, never `profile.sizes_secret`. */
export function pathCovers(ancestor: string, path: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}.`)
}

export function scopeCoversPath(scope: string, keyPath: string): boolean {
  const parsed = parseScope(scope)
  return parsed !== null && pathCovers(parsed.path, keyPath)
}

export type ScopeInput = { ok: true; scopes: string[] } | { ok: false; message: string }

/**
 * Turns free text (one scope per line, or comma separated) into canonical scopes. A bare path
 * such as `profile.sizes` becomes `profile.sizes:read`. Duplicates are dropped and the result is sorted.
 */
export function parseScopeInput(text: string): ScopeInput {
  const entries = text
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (entries.length === 0) return { ok: false, message: 'Add at least one scope.' }
  const scopes = new Set<string>()
  for (const entry of entries) {
    const scope = entry.includes(':') ? entry : `${entry}:read`
    if (!parseScope(scope)) {
      return {
        ok: false,
        message: `"${entry}" is not a valid scope. Use lowercase dotted paths such as profile.sizes:read.`,
      }
    }
    scopes.add(scope)
  }
  return { ok: true, scopes: [...scopes].sort() }
}
