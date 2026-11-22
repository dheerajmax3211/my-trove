import { ApiError, createApiClient } from '@platform/api-client'
import { describe, expect, it } from 'vitest'
import { createTreasuryApi, parseRunLine } from './treasuryApi'

interface Captured {
  url: string
  method: string
  headers: Headers
  body: unknown
}

function setup(
  respond: () => Response = () =>
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
) {
  const calls: Captured[] = []
  const fetchSpy: typeof fetch = (input, init) => {
    calls.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    })
    return Promise.resolve(respond())
  }
  const client = createApiClient({
    baseUrl: '/api',
    getToken: () => 'tok',
    fetch: fetchSpy,
  })
  return { api: createTreasuryApi(client), calls }
}

describe('invite codes', () => {
  it('creates, lists and cancels invites for one household, and redeems a code on the caller account', async () => {
    const { api, calls } = setup()
    await api.createInvite('h1', { role: 'APPROVER', ttlHours: 24 })
    await api.listInvites('h1')
    await api.revokeInvite('h1', 'i1')
    await api.acceptInvite('  code-1 ')
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['POST', '/api/v1/households/h1/invites'],
      ['GET', '/api/v1/households/h1/invites'],
      ['DELETE', '/api/v1/households/h1/invites/i1'],
      ['POST', '/api/v1/households/invites/accept'],
    ])
    expect(calls[0]!.body).toEqual({ role: 'APPROVER', ttlHours: 24 })
    expect(calls[3]!.body).toEqual({ code: '  code-1 ' })
  })
})

describe('request shapes', () => {
  it('sends the Idempotency-Key header and JSON body on every money post', async () => {
    const { api, calls } = setup()
    await api.deposit(
      'h1',
      { toAccountId: 'a', incomeAccountId: null, amountMinor: 1250, description: 'x' },
      'key-1',
    )
    await api.spend(
      'h1',
      { fromAccountId: 'a', categoryAccountId: 'c', amountMinor: 5, description: 'y' },
      'key-2',
    )
    await api.transfer(
      'h1',
      { fromAccountId: 'a', toAccountId: 'b', amountMinor: 5, description: 'z' },
      'key-3',
    )
    await api.split(
      'h1',
      {
        expenseAccountId: 'e',
        totalMinor: 100,
        description: 'p',
        shares: [{ accountId: 'a', weight: 2 }],
      },
      'key-4',
    )
    await api.reverse('h1', 'e1', 'because', 'key-5')
    await api.approve('h1', 'ap1', 'key-6')
    await api.reject('h1', 'ap1', 'no', 'key-7')
    await api.createHousehold(
      { name: 'N', currency: 'USD', approvalThresholdMinor: null, approvalExpiryHours: 72 },
      'key-8',
    )

    expect(calls.map((c) => [c.method, c.url, c.headers.get('Idempotency-Key')])).toEqual([
      ['POST', '/api/v1/households/h1/deposits', 'key-1'],
      ['POST', '/api/v1/households/h1/spends', 'key-2'],
      ['POST', '/api/v1/households/h1/transfers', 'key-3'],
      ['POST', '/api/v1/households/h1/splits', 'key-4'],
      ['POST', '/api/v1/households/h1/entries/e1/reverse', 'key-5'],
      ['POST', '/api/v1/households/h1/approvals/ap1/approve', 'key-6'],
      ['POST', '/api/v1/households/h1/approvals/ap1/reject', 'key-7'],
      ['POST', '/api/v1/households', 'key-8'],
    ])
    expect(calls[0]!.body).toEqual({
      toAccountId: 'a',
      incomeAccountId: null,
      amountMinor: 1250,
      description: 'x',
    })
    expect(calls[3]!.body).toEqual({
      expenseAccountId: 'e',
      totalMinor: 100,
      description: 'p',
      shares: [{ accountId: 'a', weight: 2 }],
    })
    expect(calls[4]!.body).toEqual({ reason: 'because' })
    expect(calls[6]!.body).toEqual({ note: 'no' })
    expect(calls[0]!.headers.get('Authorization')).toBe('Bearer tok')
  })

  it('does not send an Idempotency-Key on reads or on the non-idempotent writes', async () => {
    const { api, calls } = setup()
    await api.getHousehold('h1')
    await api.listEntries('h1', 2, 20)
    await api.updateSettings('h1', { approvalThresholdMinor: 5000, approvalExpiryHours: 24 })
    await api.addMember('h1', { uid: 'u1', role: 'KID', displayName: null })
    await api.changeRole('h1', 'u 1', 'APPROVER')
    await api.createSchedule('h1', {
      fromAccountId: null,
      toAccountId: 'a',
      amountMinor: 100,
      frequency: 'WEEKLY',
      startDate: '2026-12-01',
      description: 'd',
    })
    await api.pauseSchedule('h1', 's1')
    expect(calls.every((c) => c.headers.get('Idempotency-Key') === null)).toBe(true)
    expect(calls[1]!.url).toBe('/api/v1/households/h1/entries?page=2&size=20')
    expect(calls[2]).toMatchObject({ method: 'PUT', url: '/api/v1/households/h1/settings' })
    expect(calls[4]!.url).toBe('/api/v1/households/h1/members/u%201/role')
    expect(calls[6]).toMatchObject({
      method: 'DELETE',
      url: '/api/v1/households/h1/allowance-schedules/s1',
    })
  })

  it('builds statement queries, omitting empty filters, and asks for text/csv on export', async () => {
    const { api, calls } = setup(
      () => new Response('a,b\r\n', { status: 200, headers: { 'content-type': 'text/csv' } }),
    )
    await api.statement('h1', 'acc', { page: 1, size: 25 })
    await api.statement('h1', 'acc', {
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-12-01T00:00:00.000Z',
      page: 0,
      size: 10,
    })
    const csv = await api.statementCsv('h1', 'acc', { from: '2026-11-01T00:00:00.000Z' })
    expect(calls[0]!.url).toBe('/api/v1/households/h1/accounts/acc/statement?page=1&size=25')
    expect(calls[1]!.url).toContain(
      'from=2026-11-01T00%3A00%3A00.000Z&to=2026-12-01T00%3A00%3A00.000Z',
    )
    expect(calls[2]!.url).toBe(
      '/api/v1/households/h1/accounts/acc/statement.csv?from=2026-11-01T00%3A00%3A00.000Z',
    )
    expect(calls[2]!.headers.get('Accept')).toBe('text/csv')
    expect(csv).toBe('a,b\r\n')
  })

  it('filters approvals by status only when asked', async () => {
    const { api, calls } = setup()
    await api.listApprovals('h1')
    await api.listApprovals('h1', 'PENDING_APPROVAL')
    expect(calls[0]!.url).toBe('/api/v1/households/h1/approvals')
    expect(calls[1]!.url).toBe('/api/v1/households/h1/approvals?status=PENDING_APPROVAL')
  })
})

describe('response handling', () => {
  it('parses the run log lines', async () => {
    expect(parseRunLine('2026-11-02 PAID')).toEqual({ periodStart: '2026-11-02', status: 'PAID' })
    const { api } = setup(
      () =>
        new Response(JSON.stringify(['2026-11-02 SKIPPED', '2026-11-09 FAILED']), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    expect(await api.listRuns('h1', 's1')).toEqual([
      { periodStart: '2026-11-02', status: 'SKIPPED' },
      { periodStart: '2026-11-09', status: 'FAILED' },
    ])
  })

  it('maps problem+json to an ApiError carrying the backend code', async () => {
    const { api } = setup(
      () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            detail: 'entry has already been reversed',
            code: 'ALREADY_REVERSED',
          }),
          {
            status: 409,
            headers: { 'content-type': 'application/problem+json' },
          },
        ),
    )
    const error = await api.reverse('h1', 'e1', null, 'k').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, detail: 'entry has already been reversed' })
    expect((error as ApiError).extensions.code).toBe('ALREADY_REVERSED')
  })

  it('maps a dropped connection to a network ApiError', async () => {
    const client = createApiClient({
      baseUrl: '/api',
      getToken: () => 't',
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    })
    const error = await createTreasuryApi(client)
      .listHouseholds()
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 0 })
  })
})
