import { ApiError, ApiProvider, createApiClient, type ApiClient } from '@platform/api-client'
import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockBackend } from '../../../mock/backend'
import { demoSeed, OTHER_USERS_ITEM_ID } from '../../../mock/seed'
import { NOW } from '../../../testing/harness'
import {
  useCreateItem,
  useItem,
  useItems,
  useRecordReply,
  useResolveItem,
  useSnoozeItem,
} from '../hooks/useItems'
import { cancelPath, draftPath, itemPath, itemsPath, timelinePath } from './paths'
import type { Draft, Item, TimelineEvent } from './types'

const JACKET = '00000000-0000-4000-8000-000000000001'
const DESK = '00000000-0000-4000-8000-000000000004'

interface Call {
  method: string
  url: string
  body: string | undefined
  authorization: string | null
}

let calls: Call[]
let client: ApiClient

beforeEach(() => {
  calls = []
  const backend = createMockBackend({ clock: () => NOW, seed: demoSeed(NOW) })
  client = createApiClient({
    baseUrl: '/api',
    getToken: () => 'stub-token-1',
    fetch: (input, init) => {
      calls.push({
        method: (init?.method ?? 'GET').toUpperCase(),
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        body: typeof init?.body === 'string' ? init.body : undefined,
        authorization: new Headers(init?.headers).get('authorization'),
      })
      return backend.fetch(input, init)
    },
  })
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <ApiProvider
    client={client}
    queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </ApiProvider>
)

const failure = async (promise: Promise<unknown>): Promise<ApiError> => {
  try {
    await promise
  } catch (error) {
    if (error instanceof ApiError) return error
  }
  throw new Error('expected an ApiError')
}

describe('request shapes', () => {
  it('lists with repeated status parameters, a limit and the bearer token', async () => {
    const { result } = renderHook(() => useItems(['OPEN', 'NUDGED'], 100), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: '/api/v1/items?limit=100&status=OPEN&status=NUDGED',
      authorization: 'Bearer stub-token-1',
    })
    expect(result.current.data?.every((i) => ['OPEN', 'NUDGED'].includes(i.status))).toBe(true)
  })

  it('omits the status parameter for "all"', async () => {
    const { result } = renderHook(() => useItems(null, 50), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(calls[0]?.url).toBe('/api/v1/items?limit=50')
  })

  it('posts a new item as JSON and receives a reply address and no live follow-up', async () => {
    const { result } = renderHook(() => useCreateItem(), { wrapper })
    const created = await result.current.mutateAsync({
      title: 'Refund',
      counterparty: 'Shop',
      category: 'REFUND',
      amount: 20,
      currency: 'USD',
      expectedBy: '2026-11-25',
    })
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/v1/items' })
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({
      title: 'Refund',
      counterparty: 'Shop',
      category: 'REFUND',
      amount: 20,
      currency: 'USD',
      expectedBy: '2026-11-25',
    })
    expect(created.status).toBe('OPEN')
    expect(created.replyAddress).toMatch(/^waiting\+[a-f0-9]{20}@/)
    expect(created.followUp).toBeNull()
  })

  it('resolves with an optional outcome body, and snoozes with a day count', async () => {
    const resolve = renderHook(() => useResolveItem(JACKET), { wrapper })
    await resolve.result.current.mutateAsync({ outcome: 'Refunded' })
    const snooze = renderHook(() => useSnoozeItem(DESK), { wrapper })
    await snooze.result.current.mutateAsync({ days: 9 })
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['POST', `/api/v1/items/${JACKET}/resolve`, '{"outcome":"Refunded"}'],
      ['POST', `/api/v1/items/${DESK}/snooze`, '{"days":9}'],
    ])
  })

  it('records a pasted reply and returns how it was read', async () => {
    const reply = renderHook(() => useRecordReply(DESK), { wrapper })
    const result = await reply.result.current.mutateAsync({
      text: 'Your refund has been processed.',
    })
    expect(result).toMatchObject({ matched: true, applied: true, classification: 'PAID' })
    expect(calls.at(-1)).toMatchObject({
      method: 'POST',
      url: `/api/v1/items/${DESK}/replies`,
    })
    expect(JSON.parse(calls.at(-1)?.body ?? '{}')).toEqual({
      text: 'Your refund has been processed.',
    })
  })

  it('cancels with no body and fetches the draft tone as a query parameter', async () => {
    await client.post<Item>(cancelPath(DESK))
    await client.get<Draft>(draftPath(DESK), { query: { tone: 'FINAL_NOTICE' } })
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `/api/v1/items/${DESK}/cancel`,
      body: undefined,
    })
    expect(calls[1]?.url).toBe(`/api/v1/items/${DESK}/draft?tone=FINAL_NOTICE`)
  })

  it('returns live follow-up state on the detail endpoint', async () => {
    const { result } = renderHook(() => useItem(JACKET), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.followUp).toMatchObject({ stage: 'NUDGED', nextAction: 'ESCALATE' })
  })
})

describe('error mapping', () => {
  it("maps a missing item and another user's item to the same 404 problem", async () => {
    const missing = await failure(client.get(itemPath('00000000-0000-4000-8000-000000009999')))
    const foreign = await failure(client.get(itemPath(OTHER_USERS_ITEM_ID)))
    expect(missing.status).toBe(404)
    expect(foreign.status).toBe(404)
    expect(foreign.detail).toBe(missing.detail)
  })

  it("answers every endpoint for another user's item with 404", async () => {
    for (const path of [timelinePath(OTHER_USERS_ITEM_ID), draftPath(OTHER_USERS_ITEM_ID)])
      expect((await failure(client.get(path))).status).toBe(404)
    expect((await failure(client.post(cancelPath(OTHER_USERS_ITEM_ID)))).status).toBe(404)
  })

  it('answers 409 when closing an item that is already closed', async () => {
    await client.post(cancelPath(DESK))
    const again = await failure(client.post(cancelPath(DESK)))
    expect(again.status).toBe(409)
    expect(again.detail).toBe('Item is already CANCELLED')
  })

  it('answers 400 with the generic validation text for bean-validation failures', async () => {
    const error = await failure(
      client.post(itemsPath, {
        title: '',
        counterparty: 'x',
        category: 'REFUND',
        expectedBy: '2026-11-25',
      }),
    )
    expect(error).toMatchObject({ status: 400, detail: 'Invalid request content.' })
  })

  it('answers 400 for rules the service checks in code', async () => {
    const base = { title: 'a', counterparty: 'b', category: 'REFUND', expectedBy: '2026-11-25' }
    expect((await failure(client.post(itemsPath, { ...base, amount: 5 }))).detail).toBe(
      'currency is required when amount is given',
    )
    const badPlan = {
      nudgeAfterDays: 5,
      escalateAfterDays: 5,
      finalNoticeAfterDays: 0,
      expireAfterDays: 20,
    }
    expect((await failure(client.post(itemsPath, { ...base, plan: badPlan }))).detail).toBe(
      'escalateAfterDays must be after nudgeAfterDays',
    )
    expect((await failure(client.post(`${itemPath(DESK)}/snooze`, { days: 91 }))).status).toBe(400)
  })

  it('answers 401 without a usable token', async () => {
    const anonymous = createApiClient({
      baseUrl: '/api',
      getToken: () => null,
      fetch: createMockBackend({ clock: () => NOW }).fetch,
    })
    expect((await failure(anonymous.get(itemsPath))).status).toBe(401)
  })

  it('lists the timeline oldest first, as the service does', async () => {
    const events = await client.get<TimelineEvent[]>(
      timelinePath('00000000-0000-4000-8000-000000000002'),
    )
    expect(events[0]?.type).toBe('CREATED')
    expect(events.at(-1)?.type).toBe('ESCALATION_DRAFTED')
  })
})
