export interface FirebaseAuthConfig {
  apiKey: string
  projectId: string
  authDomain?: string
  appId?: string
  storageBucket?: string
  messagingSenderId?: string
  /** `host:port` of the Firebase Auth emulator, e.g. `127.0.0.1:9099`. Enables emulator mode. */
  authEmulatorHost?: string
  /** Firebase app name. Defaults to the default app. */
  appName?: string
  /**
   * Base URL of the local dev identity provider (`dev/dev-idp.mjs`). When set, `createFirebaseAuthClient`
   * signs in against it instead of Firebase, so the real services can be used with no Firebase project.
   */
  devIdpUrl?: string
}

type Env = Record<string, string | boolean | undefined>

const str = (value: string | boolean | undefined): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

/** True when `env` carries enough to start Firebase Auth (real project or emulator). */
export function isFirebaseConfigured(env: Env): boolean {
  return Boolean(
    str(env.VITE_DEV_IDP_URL) ??
    str(env.VITE_FIREBASE_AUTH_EMULATOR_HOST) ??
    (str(env.VITE_FIREBASE_API_KEY) && str(env.VITE_FIREBASE_PROJECT_ID)),
  )
}

/**
 * Build the config from Vite-style env (`import.meta.env`). Pass it explicitly from your app so
 * Vite can statically replace the values:
 *
 *   getFirebaseConfigFromEnv(import.meta.env)
 *
 * With `VITE_FIREBASE_AUTH_EMULATOR_HOST` set, demo values fill any missing key/project id so a
 * fresh checkout can run against the emulator with no real Firebase project.
 */
export function getFirebaseConfigFromEnv(env: Env): FirebaseAuthConfig {
  const devIdpUrl = str(env.VITE_DEV_IDP_URL)
  const authEmulatorHost = str(env.VITE_FIREBASE_AUTH_EMULATOR_HOST)
  const demoValues = Boolean(authEmulatorHost ?? devIdpUrl)
  const apiKey = str(env.VITE_FIREBASE_API_KEY) ?? (demoValues ? 'demo-api-key' : undefined)
  const projectId = str(env.VITE_FIREBASE_PROJECT_ID) ?? (demoValues ? 'demo-platform' : undefined)

  const missing = [
    !apiKey && 'VITE_FIREBASE_API_KEY',
    !projectId && 'VITE_FIREBASE_PROJECT_ID',
  ].filter(Boolean)
  if (!apiKey || !projectId) {
    throw new Error(
      `Missing Firebase config: ${missing.join(', ')}. Copy .env.example to .env.local, or set VITE_FIREBASE_AUTH_EMULATOR_HOST to use the emulator.`,
    )
  }

  const config: FirebaseAuthConfig = { apiKey, projectId }
  const optional = {
    authDomain: str(env.VITE_FIREBASE_AUTH_DOMAIN),
    appId: str(env.VITE_FIREBASE_APP_ID),
    storageBucket: str(env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: str(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    authEmulatorHost,
    devIdpUrl,
  }
  for (const [key, value] of Object.entries(optional)) {
    if (value) (config as unknown as Record<string, string>)[key] = value
  }
  return config
}
