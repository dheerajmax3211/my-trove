const DEFAULT_WORKSPACE_URL = 'http://localhost:5190'
const DEFAULT_REPO_URL = 'https://github.com/dheerajmax3211/my-trove'

function clean(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return (trimmed ? trimmed : fallback).replace(/\/+$/, '')
}

// These read `import.meta.env` on every call (not once at import) so tests can stub the variables.

/** The signed-in workspace: the "Open the workspace" target. */
export function workspaceUrl(): string {
  return clean(import.meta.env.VITE_WORKSPACE_URL, DEFAULT_WORKSPACE_URL)
}

/** The same workspace in demo mode: stub sign-in and sample data in the browser. */
export function demoUrl(): string {
  return `${workspaceUrl()}/?demo=1`
}

/** The public repository. */
export function repoUrl(): string {
  return clean(import.meta.env.VITE_REPO_URL, DEFAULT_REPO_URL)
}

/** A folder or file in the repository, on the main branch. */
export function repoPath(path: string): string {
  return `${repoUrl()}/tree/main/${path.replace(/^\/+/, '')}`
}
