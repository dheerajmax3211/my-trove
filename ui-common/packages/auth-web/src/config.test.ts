import { describe, expect, it } from 'vitest'
import { getFirebaseConfigFromEnv, isFirebaseConfigured } from './config'

describe('getFirebaseConfigFromEnv', () => {
  it('maps VITE_FIREBASE_* variables and ignores blanks', () => {
    const config = getFirebaseConfigFromEnv({
      VITE_FIREBASE_API_KEY: 'key',
      VITE_FIREBASE_PROJECT_ID: 'proj',
      VITE_FIREBASE_AUTH_DOMAIN: 'proj.firebaseapp.com',
      VITE_FIREBASE_APP_ID: '  ',
    })
    expect(config).toEqual({ apiKey: 'key', projectId: 'proj', authDomain: 'proj.firebaseapp.com' })
  })

  it('fills demo credentials when the emulator host is set', () => {
    expect(
      getFirebaseConfigFromEnv({ VITE_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }),
    ).toEqual({
      apiKey: 'demo-api-key',
      projectId: 'demo-platform',
      authEmulatorHost: '127.0.0.1:9099',
    })
  })

  it('throws a helpful error naming the missing variables', () => {
    expect(() => getFirebaseConfigFromEnv({})).toThrow(
      /VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID/,
    )
  })

  it('isFirebaseConfigured reflects whether anything usable is present', () => {
    expect(isFirebaseConfigured({})).toBe(false)
    expect(isFirebaseConfigured({ VITE_FIREBASE_API_KEY: 'k' })).toBe(false)
    expect(
      isFirebaseConfigured({ VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_PROJECT_ID: 'p' }),
    ).toBe(true)
    expect(isFirebaseConfigured({ VITE_FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' })).toBe(true)
  })
})

describe('dev identity provider config', () => {
  it('counts as configured and fills demo Firebase values', () => {
    const env = { VITE_DEV_IDP_URL: 'http://localhost:9100' }
    expect(isFirebaseConfigured(env)).toBe(true)
    expect(getFirebaseConfigFromEnv(env)).toEqual({
      apiKey: 'demo-api-key',
      projectId: 'demo-platform',
      devIdpUrl: 'http://localhost:9100',
    })
  })
})
