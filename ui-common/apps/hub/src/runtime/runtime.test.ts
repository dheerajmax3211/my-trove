import { describe, expect, it } from 'vitest'
import { resolveLauncherApps } from '../config/apps'
import { createRuntime } from './runtime'

describe('createRuntime', () => {
  it('defaults to demo mode when no Firebase config is present', () => {
    const runtime = createRuntime({ env: {}, latencyMs: 0 })
    expect(runtime.mode).toBe('demo')
    expect(runtime.demo?.users.length).toBeGreaterThan(1)
    expect(runtime.apiBaseUrl).toBe('/api')
  })
  it('forces demo mode with VITE_USE_MOCK even when Firebase is configured', () => {
    const runtime = createRuntime({
      env: { VITE_USE_MOCK: 'true', VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_PROJECT_ID: 'p' },
      latencyMs: 0,
    })
    expect(runtime.mode).toBe('demo')
  })
  it('goes live when Firebase is configured, honouring the API base and the emulator alias', () => {
    const runtime = createRuntime({
      env: {
        VITE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        VITE_API_BASE_URL: 'https://gw.example/api/',
      },
    })
    expect(runtime.mode).toBe('live')
    expect(runtime.demo).toBeNull()
    expect(runtime.apiBaseUrl).toBe('https://gw.example/api')
    expect(runtime.downloadUrl('/v1/files/download?token=t')).toBe(
      'https://gw.example/api/shared/v1/files/download?token=t',
    )
  })
})

describe('resolveLauncherApps', () => {
  it('defaults to localhost 5182 to 5187 in a fixed order', () => {
    expect(resolveLauncherApps({}).map((a) => [a.id, a.url])).toEqual([
      ['waiting-on', 'http://localhost:5182'],
      ['consent', 'http://localhost:5183'],
      ['home-pulse', 'http://localhost:5184'],
      ['ask-your-life', 'http://localhost:5185'],
      ['digital-legacy', 'http://localhost:5186'],
      ['family-treasury', 'http://localhost:5187'],
    ])
  })
  it('takes VITE_APP_URL_<NAME> overrides but only for http(s) URLs', () => {
    const apps = resolveLauncherApps({
      VITE_APP_URL_WAITING_ON: 'https://waiting.example.com',
      VITE_APP_URL_CONSENT: 'javascript:alert(1)',
    })
    expect(apps.find((a) => a.id === 'waiting-on')?.url).toBe('https://waiting.example.com')
    expect(apps.find((a) => a.id === 'consent')?.url).toBe('http://localhost:5183')
  })
})
