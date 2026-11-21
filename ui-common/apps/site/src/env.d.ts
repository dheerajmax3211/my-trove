/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where "Open the workspace" points. Default http://localhost:5190. */
  readonly VITE_WORKSPACE_URL?: string
  /** Public source repository. Default https://github.com/dheerajmax3211/my-trove. */
  readonly VITE_REPO_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
