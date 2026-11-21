import { ApiProvider, createApiClient, createApiQueryClient } from '@platform/api-client'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { Household, Invite } from '../features/households/types'
import type { Reminder } from '../features/reminders/types'
import { CoreEnvProvider, type CoreEnv } from './env'
import { buildTodayItems, useTodayItems } from './today'

const NOW = Date.parse('2026-11-19T09:00:00Z')
const DAY = 86_400_000
const at = (days: number) => new Date(NOW + days * DAY).toISOString()

const reminder = (
  id: string,
  title: string,
  days: number,
  extra: Partial<Reminder> = {},
): Reminder => ({
  id,
  ownerUid: 'u1',
  householdId: null,
  title,
  dueAt: at(days),
  recurrence: null,
  status: 'ACTIVE',
  lastFiredAt: null,
  createdAt: at(-10),
  ...extra,
})

const OWNED: Household = { id: 'h1', name: 'Rivera household', role: 'OWNER', createdAt: at(-30) }
const JOINED: Household = { id: 'h2', name: 'Lake house', role: 'MEMBER', createdAt: at(-20) }
const INVITE: Invite = {
  id: 'i1',
  role: 'MEMBER',
  createdBy: 'u1',
  createdAt: at(-1),
  expiresAt: at(6),
}

const REMINDERS: Reminder[] = [
  reminder('r1', 'Pay the water bill', -1),
  reminder('r2', 'Water the plants', 2, { householdId: 'h1' }),
  reminder('r3', 'Renew passport', 10),
  reminder('r4', 'Book dentist', 1, { status: 'COMPLETED' }),
  reminder('r5', 'Call the plumber', 2.9),
]

describe('buildTodayItems', () => {
  const items = buildTodayItems({
    reminders: REMINDERS,
    households: [OWNED, JOINED],
    invites: [{ household: OWNED, invites: [INVITE] }],
    now: NOW,
  })

  it('marks overdue reminders as danger and ones due within three days as warn', () => {
    const byId = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(byId['reminder:r1']).toMatchObject({
      severity: 'danger',
      title: 'Pay the water bill',
      to: '/reminders',
      dueAt: at(-1),
    })
    expect(byId['reminder:r1']?.subtitle).toBe('Overdue by 1 day · Personal')
    expect(byId['reminder:r2']).toMatchObject({ severity: 'warn' })
    expect(byId['reminder:r2']?.subtitle).toMatch(/Rivera household$/)
    expect(byId['reminder:r5']).toMatchObject({ severity: 'warn' })
  })

  it('leaves out reminders further away than three days and ones that are not active', () => {
    const ids = items.map((i) => i.id)
    expect(ids).not.toContain('reminder:r3')
    expect(ids).not.toContain('reminder:r4')
  })

  it('lists an unused invite as info that opens the household', () => {
    const invite = items.find((i) => i.id === 'invite:i1')
    expect(invite).toMatchObject({
      severity: 'info',
      to: '/households/h1',
      dueAt: INVITE.expiresAt,
    })
    expect(invite?.title).toContain('Rivera household')
  })

  it('gives every item a unique id and a path relative to the module', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    for (const item of items) expect(item.to.startsWith('/')).toBe(true)
  })

  it('is empty when there is nothing to say', () => {
    expect(buildTodayItems({ reminders: [], households: [], invites: [], now: NOW })).toEqual([])
  })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function wrapperFor(fetchImpl: typeof fetch) {
  const client = createApiClient({
    baseUrl: 'http://gateway.test/api/shared',
    getToken: () => 'token',
    fetch: fetchImpl,
  })
  const queryClient = createApiQueryClient()
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  })
  const env: CoreEnv = {
    now: () => NOW,
    downloadUrl: (p) => p,
    saveDownload: () => Promise.resolve(),
    directory: {},
  }
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider client={client} queryClient={queryClient}>
        <CoreEnvProvider env={env}>{children}</CoreEnvProvider>
      </ApiProvider>
    )
  }
}

describe('useTodayItems', () => {
  const fixtureFetch: typeof fetch = (input) => {
    const url = new URL(typeof input === 'string' ? input : (input as Request).url)
    if (url.pathname === '/api/shared/v1/reminders') return Promise.resolve(json(REMINDERS))
    if (url.pathname === '/api/shared/v1/households') return Promise.resolve(json([OWNED, JOINED]))
    if (url.pathname === '/api/shared/v1/households/h1/invites')
      return Promise.resolve(json([INVITE]))
    return Promise.resolve(json({ title: 'Not found', status: 404 }, 404))
  }

  it('reports loading, then reminders and invites from the service', async () => {
    const { result } = renderHook(() => useTodayItems(), { wrapper: wrapperFor(fixtureFetch) })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items.map((i) => i.id).sort()).toEqual([
      'invite:i1',
      'reminder:r1',
      'reminder:r2',
      'reminder:r5',
    ])
  })

  it('only asks about invites for households the user owns', async () => {
    const calls: string[] = []
    const spy: typeof fetch = (input, init) => {
      calls.push(new URL(typeof input === 'string' ? input : (input as Request).url).pathname)
      return fixtureFetch(input, init)
    }
    const { result } = renderHook(() => useTodayItems(), { wrapper: wrapperFor(spy) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(calls).toContain('/api/shared/v1/households/h1/invites')
    expect(calls).not.toContain('/api/shared/v1/households/h2/invites')
  })

  it('returns the same value between renders when nothing changed', async () => {
    const { result, rerender } = renderHook(() => useTodayItems(), {
      wrapper: wrapperFor(fixtureFetch),
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
    expect(result.current.items).toBe(first.items)
  })

  it('stops loading and shows nothing when the service fails', async () => {
    const failing: typeof fetch = () => Promise.resolve(json({ title: 'Down', status: 500 }, 500))
    const { result } = renderHook(() => useTodayItems(), { wrapper: wrapperFor(failing) })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([])
  })
})
