import { createApiClient } from '@platform/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderModule } from '../test/renderModule'
import { resolveServiceBase, STANDALONE_API_ROOT, WORKSPACE_API_ROOT } from './env'
import { memberLabel, resetPeopleStores } from './people'

const client = createApiClient({ baseUrl: 'http://x.test/api/shared', getToken: () => null })

describe('resolveServiceBase', () => {
  it('builds <gateway>/shared from the configured gateway root', () => {
    expect(resolveServiceBase(client, true, { VITE_API_BASE_URL: 'https://gw.example/api/' })).toBe(
      'https://gw.example/api/shared',
    )
  })
  it('falls back to the standalone proxy or the workspace gateway', () => {
    expect(resolveServiceBase(client, false, {})).toBe(`${STANDALONE_API_ROOT}/shared`)
    expect(resolveServiceBase(client, true, {})).toBe(`${WORKSPACE_API_ROOT}/shared`)
    expect(WORKSPACE_API_ROOT).toBe('http://localhost:8080/api')
  })
  it('believes a client that says where it is bound', () => {
    const advertising = { ...client, baseUrl: 'https://bound.example/api/shared/' }
    expect(resolveServiceBase(advertising, true, { VITE_API_BASE_URL: 'https://other' })).toBe(
      'https://bound.example/api/shared',
    )
  })
})

afterEach(() => vi.restoreAllMocks())

describe('file download under the gateway', () => {
  it('builds the signed link under the shared service and saves it without touching the network', async () => {
    const saved: string[] = []
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download)
    })
    const realFetch = vi.fn(() => Promise.reject(new Error('demo mode must not use the network')))
    vi.stubGlobal('fetch', realFetch)

    const { user } = renderModule({ route: '/files' })
    await user.click(
      await screen.findByRole('button', { name: 'Get link for Home insurance summary.txt' }),
    )
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Create link' }))
    const field = await within(dialog).findByRole<HTMLInputElement>('textbox', {
      name: 'Download link',
    })
    expect(field.value).toMatch(
      /^http:\/\/localhost:8080\/api\/shared\/v1\/files\/download\?token=[\w.-]+$/,
    )

    await user.click(within(dialog).getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(saved).toEqual(['Home insurance summary.txt']))
    expect(await (createUrl.mock.calls[0]?.[0] as Blob).text()).toContain('Home insurance summary')
    expect(realFetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('usePeople', () => {
  afterEach(() => {
    window.localStorage.clear()
    resetPeopleStores()
  })

  it('shows a short stable label for people it cannot name, and lets the user name them', async () => {
    const { user } = renderModule({ route: '/households' })
    await user.click(await screen.findByRole('link', { name: 'Rivera household' }))
    const list = await screen.findByRole('list', { name: 'Household members' })
    expect(within(list).getByText('Bob Rivera')).toBeInTheDocument()

    await user.click(within(list).getByRole('button', { name: 'Name Bob Rivera' }))
    const dialog = screen.getByRole('dialog', { name: 'Name this person' })
    await user.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Uncle Bob')
    await user.click(within(dialog).getByRole('button', { name: 'Save name' }))
    // The nickname shows wherever Bob appears, at once.
    expect(await within(list).findByText('Uncle Bob')).toBeInTheDocument()
    expect(window.localStorage.getItem('pp.core.people.demo-user')).toContain('Uncle Bob')
  })

  it('labels an unknown uid with its last four characters', () => {
    expect(memberLabel('firebase-uid-3fK9')).toBe('Member 3fK9')
  })
})
