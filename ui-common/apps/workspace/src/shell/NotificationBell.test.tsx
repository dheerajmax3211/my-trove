import { ApiProvider, createApiClient } from '@platform/api-client'
import type { ProductModule } from '@platform/workspace-kit'
import { InboxIcon } from '@platform/ui'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { INBOX_PATH, NotificationBell, inboxHref, type InboxItem } from './NotificationBell'

const API = 'http://localhost:8080/api'

function module(id: string): ProductModule {
  return {
    id,
    service: id,
    title: id,
    tagline: '',
    description: '',
    accent: 'var(--pp-color-accent)',
    icon: InboxIcon,
    nav: [],
    Routes: () => null,
  }
}

const MODULES = [module('consent'), module('waiting-on')]

function item(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'n-1',
    kind: 'CONSENT_REQUEST',
    source: 'consent-gateway',
    title: 'Access request from Shoe Shop',
    body: 'Shoe Shop asks to see your sizes.',
    link: '/consent',
    status: 'SENT',
    createdAt: '2026-11-22T10:00:00Z',
    readAt: null,
    ...overrides,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A fake gateway: answers the inbox and records every request made to it. */
function fakeGateway(inbox: InboxItem[] | 'error') {
  const calls: { method: string; url: string }[] = []
  const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? 'GET'
    calls.push({ method, url })
    if (url === `${API}${INBOX_PATH}` && method === 'GET') {
      return inbox === 'error' ? json({ title: 'down', status: 500 }, 500) : json(inbox)
    }
    if (url.endsWith('/read') && method === 'POST') {
      return json({ ...item(), readAt: '2026-11-22T10:05:00Z' })
    }
    return json({ title: 'not found', status: 404 }, 404)
  })
  return { fetchImpl, calls }
}

function renderBell(inbox: InboxItem[] | 'error') {
  const gateway = fakeGateway(inbox)
  const client = createApiClient({
    baseUrl: API,
    getToken: () => Promise.resolve('token'),
    fetch: gateway.fetchImpl as unknown as typeof fetch,
  })
  function Where() {
    const location = useLocation()
    return <p data-testid="where">{location.pathname}</p>
  }
  render(
    <ApiProvider client={client}>
      <MemoryRouter initialEntries={['/app/home']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <NotificationBell open onClose={() => undefined} modules={MODULES} enabled />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </ApiProvider>,
  )
  return gateway
}

describe('inboxHref', () => {
  it('points a product link at that product inside the workspace', () => {
    expect(inboxHref('/consent', MODULES)).toBe('/app/consent')
    expect(inboxHref('/waiting-on', MODULES)).toBe('/app/waiting-on')
    expect(inboxHref('/consent/requests/abc', MODULES)).toBe('/app/consent/requests/abc')
  })

  it('does not link to a product the workspace does not host', () => {
    expect(inboxHref('/digital-legacy', MODULES)).toBeNull()
    expect(inboxHref(null, MODULES)).toBeNull()
  })
})

describe('NotificationBell', () => {
  it('lists the inbox, newest first, with its titles and bodies', async () => {
    renderBell([item(), item({ id: 'n-2', title: 'Reminder: bins', body: null, link: null })])
    const list = await screen.findByRole('list', { name: 'Notifications' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Access request from Shoe Shop')).toBeInTheDocument()
    expect(screen.getByText('Shoe Shop asks to see your sizes.')).toBeInTheDocument()
    expect(screen.getByText('Reminder: bins')).toBeInTheDocument()
  })

  it('says so plainly when there is nothing in the inbox', async () => {
    renderBell([])
    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument()
  })

  it('says so plainly when the inbox cannot be loaded', async () => {
    renderBell('error')
    expect(await screen.findByText(/could not load notifications/i)).toBeInTheDocument()
  })

  it('marks an item read and opens the product it is about', async () => {
    const user = userEvent.setup()
    const gateway = renderBell([item()])
    await user.click(await screen.findByRole('button', { name: /access request from shoe shop/i }))

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/app/consent'))
    expect(gateway.calls).toContainEqual({ method: 'POST', url: `${API}${INBOX_PATH}/n-1/read` })
  })

  it('marks unread items as unread and leaves read ones alone', async () => {
    renderBell([
      item({ readAt: null }),
      item({ id: 'n-2', title: 'Old one', readAt: '2026-11-20T10:00:00Z' }),
    ])
    const list = await screen.findByRole('list', { name: 'Notifications' })
    const [unread, read] = within(list).getAllByRole('listitem')
    expect(unread).toHaveAttribute('data-unread', 'true')
    expect(read).toHaveAttribute('data-unread', 'false')
  })
})
