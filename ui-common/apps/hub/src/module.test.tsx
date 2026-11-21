import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { productModule } from './module'
import { renderModule } from './test/renderModule'

describe('productModule', () => {
  it('has the identity the workspace registry expects', () => {
    expect(productModule.id).toBe('core')
    expect(productModule.service).toBe('shared')
    expect(productModule.title).toBe('Household')
    expect(productModule.requiredPermission).toBe('products:use')
    expect(productModule.accent).toMatch(/^var\(--pp-color-/)
    expect(typeof productModule.icon).toBe('function')
    expect(typeof productModule.Routes).toBe('function')
    expect(typeof productModule.Providers).toBe('function')
    expect(typeof productModule.useTodayItems).toBe('function')
    expect(typeof productModule.createDemoFetch).toBe('function')
  })

  it('declares navigation relative to the module base, with an icon each', () => {
    expect(productModule.nav.map((n) => [n.label, n.to])).toEqual([
      ['Overview', '/'],
      ['Households', '/households'],
      ['Reminders', '/reminders'],
      ['Files', '/files'],
      ['Activity', '/activity'],
    ])
    expect(productModule.nav.find((n) => n.to === '/')?.end).toBe(true)
    for (const item of productModule.nav) {
      expect(item.to.startsWith('/')).toBe(true)
      expect(item.icon).toBeDefined()
    }
  })

  it('describes itself in plain words', () => {
    expect(productModule.tagline).not.toMatch(/lorem|todo/i)
    expect(productModule.description.length).toBeGreaterThan(40)
  })
})

describe('createDemoFetch', () => {
  it('serves the shared service under /v1 with no network, as the workspace demo user', async () => {
    const demoFetch = productModule.createDemoFetch?.()
    expect(demoFetch).toBeTypeOf('function')
    // The workspace's stub sign-in issues tokens like this one; they are read as the demo user.
    const response = await demoFetch?.('http://gw.test/api/shared/v1/households', {
      headers: { authorization: 'Bearer stub-token-1' },
    })
    expect(response?.status).toBe(200)
    const households = (await response?.json()) as Array<{ name: string; role: string }>
    expect(households).toEqual([
      expect.objectContaining({ name: 'Rivera household', role: 'OWNER' }),
    ])
  })

  it('refuses a call with no token and knows nothing about the auth service', async () => {
    const demoFetch = productModule.createDemoFetch?.()
    expect((await demoFetch?.('http://gw.test/api/shared/v1/households'))?.status).toBe(401)
    expect(
      (
        await demoFetch?.('http://gw.test/api/auth/v1/me', {
          headers: { authorization: 'Bearer stub-token-1' },
        })
      )?.status,
    ).toBe(404)
  })
})

describe('mounted under a base', () => {
  const ROUTES = ['/', '/households', '/reminders', '/files', '/activity', '/nowhere'] as const

  it.each(ROUTES)('every link on %s stays under /app/core', async (route) => {
    renderModule({ route })
    await screen.findByRole('heading', { level: 1 })
    // Let the lists settle so their links exist too.
    await new Promise((resolve) => setTimeout(resolve, 50))
    const hrefs = screen.queryAllByRole('link').map((a) => a.getAttribute('href') ?? '')
    // Reminders, files and activity link nowhere on their own; the others always do.
    if (['/', '/households', '/nowhere'].includes(route)) expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href.startsWith('/app/core')).toBe(true)
  })

  it('links from the overview lead to pages under the base, and a household page keeps them there', async () => {
    const { user } = renderModule()
    await user.click(await screen.findByRole('link', { name: 'Open household' }))
    expect(screen.getByTestId('where').textContent).toMatch(/^\/app\/core\/households\/[^/]+$/)
    await screen.findByRole('heading', { level: 1, name: 'Rivera household' })
    for (const a of screen.getAllByRole('link'))
      expect(a.getAttribute('href')?.startsWith('/app/core')).toBe(true)
    await user.click(screen.getByRole('link', { name: 'View activity' }))
    expect(screen.getByTestId('where').textContent).toBe('/app/core/activity')
  })

  it('navigates under the base after creating a household', async () => {
    const { user } = renderModule({ route: '/households' })
    await user.click(await screen.findByRole('button', { name: 'Create household' }))
    await user.type(screen.getByRole('textbox', { name: /Household name/ }), 'Lake house')
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create household' }),
    )
    await screen.findByRole('heading', { level: 1, name: 'Lake house' })
    expect(screen.getByTestId('where').textContent).toMatch(/^\/app\/core\/households\//)
  })
})

describe('isolation from the auth service', () => {
  it('makes no request to an auth path while every page is used', async () => {
    const { user, requests, unmount } = renderModule()
    await screen.findByRole('heading', { name: 'Rivera household' })
    await user.click(screen.getByRole('link', { name: 'Open household' }))
    await screen.findByRole('heading', { level: 1, name: 'Rivera household' })
    unmount()
    for (const route of ['/reminders', '/files', '/activity', '/households']) {
      const view = renderModule({ route })
      await screen.findByRole('heading', { level: 1 })
      await new Promise((resolve) => setTimeout(resolve, 30))
      requests.push(...view.requests)
      view.unmount()
    }
    expect(requests.length).toBeGreaterThan(5)
    for (const request of requests) {
      expect(request.url).toContain('/api/shared/v1/')
      expect(request.url).not.toMatch(/\/auth(\/|$)/)
    }
  })
})
