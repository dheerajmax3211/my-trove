import { describe, expect, it } from 'vitest'
import { productModule } from './module'
import { createDemoFetch } from './demoFetch'

describe('productModule', () => {
  it('has the identity the workspace registry expects', () => {
    expect(productModule.id).toBe('family-treasury')
    expect(productModule.service).toBe('family-treasury')
    expect(productModule.title).toBe('Family Treasury')
    expect(productModule.accent).toMatch(/^var\(--pp-color-/)
    expect(productModule.requiredPermission).toBeUndefined()
    expect(typeof productModule.Routes).toBe('function')
    expect(typeof productModule.Providers).toBe('function')
    expect(typeof productModule.useTodayItems).toBe('function')
    expect(typeof productModule.createDemoFetch).toBe('function')
    expect(productModule.description).toMatch(/no real money moves/i)
  })

  it('exposes the static pages; household sections live inside the module', () => {
    expect(productModule.nav.map((n) => [n.to, n.label])).toEqual([
      ['/', 'My household'],
      ['/welcome', 'New household'],
    ])
    for (const item of productModule.nav) expect(item.to.startsWith('/')).toBe(true)
  })

  it('createDemoFetch is the in-memory mock, answering as the demo household owner', async () => {
    const demoFetch = productModule.createDemoFetch?.()
    expect(demoFetch).toBeTypeOf('function')
    // the workspace's stub token is not a mock token: the demo fetch must not 401
    const response = await demoFetch!('http://gateway.test/api/family-treasury/v1/households', {
      headers: { Authorization: 'Bearer stub-token-1' },
    })
    expect(response.status).toBe(200)
    const households = (await response.json()) as { name: string }[]
    expect(households.map((h) => h.name)).toContain('Okafor family')
  })

  it('exports a demo fetch that never needs the network', async () => {
    const fetched = createDemoFetch()
    const response = await fetched('/api/v1/households')
    expect(response.status).toBe(200)
  })
})
