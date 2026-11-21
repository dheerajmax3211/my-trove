import type { ApiError } from '@platform/api-client'
import { describe, expect, it } from 'vitest'
import { apiFor, seededBackend } from '../test/fixtures'
import { csvCell } from './ledger'

const code = (error: unknown) => (error as ApiError).extensions.code

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    return error as ApiError
  }
  throw new Error('expected the request to fail')
}

describe('mock backend: contract with the real service', () => {
  it('rejects a missing token with 401 problem+json', async () => {
    const { backend } = seededBackend()
    const response = await backend.fetch('/api/v1/households')
    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })

  it('hides households from outsiders with 404 (existence is not leaked)', async () => {
    const { backend, household } = seededBackend()
    const err = await failure(apiFor(backend, 'u-stranger').getHousehold(household.id))
    expect(err.status).toBe(404)
  })

  it('requires an Idempotency-Key on money posts', async () => {
    const { backend, household } = seededBackend()
    const response = await backend.fetch(`/api/v1/households/${household.id}/deposits`, {
      method: 'POST',
      headers: { authorization: 'Bearer demo:u-maya', 'content-type': 'application/json' },
      body: JSON.stringify({ toAccountId: null, amountMinor: 100, description: 'x' }),
    })
    expect(response.status).toBe(400)
  })

  it('replays an identical request instead of posting twice, and flags the replay', async () => {
    const { backend, household } = seededBackend()
    const body = JSON.stringify({ amountMinor: 1000, description: 'Tip jar' })
    const send = () =>
      backend.fetch(`/api/v1/households/${household.id}/deposits`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer demo:u-maya',
          'content-type': 'application/json',
          'idempotency-key': 'same-key',
        },
        body,
      })
    const before = backend.balanceOf(household.id, 'POOL')
    const first = await send()
    const second = await send()
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(first.headers.get('Idempotent-Replayed')).toBeNull()
    expect(second.headers.get('Idempotent-Replayed')).toBe('true')
    expect(((await first.json()) as { id: string }).id).toBe(
      ((await second.json()) as { id: string }).id,
    )
    expect(backend.balanceOf(household.id, 'POOL')).toBe(before + 1000)
  })

  it('answers 409 IDEMPOTENCY_KEY_REUSED when the same key carries a different request', async () => {
    const { backend, household } = seededBackend()
    const api = apiFor(backend, 'u-maya')
    await api.deposit(
      household.id,
      {
        toAccountId: backend.accountOf(household.id, 'POOL').id,
        incomeAccountId: null,
        amountMinor: 100,
        description: 'a',
      },
      'k1',
    )
    const err = await failure(
      api.deposit(
        household.id,
        {
          toAccountId: backend.accountOf(household.id, 'POOL').id,
          incomeAccountId: null,
          amountMinor: 200,
          description: 'a',
        },
        'k1',
      ),
    )
    expect(err.status).toBe(409)
    expect(code(err)).toBe('IDEMPOTENCY_KEY_REUSED')
  })

  it('does not record failed operations, so a 422 can be retried with the same key', async () => {
    const { backend, household } = seededBackend()
    const api = apiFor(backend, 'u-sam')
    const pot = backend.accountOf(household.id, 'POT:u-sam')
    const category = backend.accountOf(household.id, 'EXPENSE:GENERAL')
    const tooMuch = {
      fromAccountId: pot.id,
      categoryAccountId: category.id,
      amountMinor: 9_000,
      description: 'Bike',
    }
    const err = await failure(api.spend(household.id, tooMuch, 'retry-key'))
    expect(err.status).toBe(422)
    expect(code(err)).toBe('INSUFFICIENT_FUNDS')
    const smaller = { ...tooMuch, amountMinor: 500 }
    await expect(api.spend(household.id, smaller, 'retry-key')).resolves.toMatchObject({
      status: 'POSTED',
    })
  })

  it('keeps balances exact and the ledger reconciled after a mix of operations', async () => {
    const { backend, household } = seededBackend()
    const api = apiFor(backend, 'u-maya')
    const pool = backend.accountOf(household.id, 'POOL')
    const ada = backend.accountOf(household.id, 'POT:u-ada')
    const poolBefore = backend.balanceOf(household.id, 'POOL')
    await api.transfer(
      household.id,
      { fromAccountId: pool.id, toAccountId: ada.id, amountMinor: 1_234, description: 'Top up' },
      't1',
    )
    expect(backend.balanceOf(household.id, 'POOL')).toBe(poolBefore - 1_234)
    const report = await api.reconcile(household.id)
    expect(report.consistent).toBe(true)
    expect(report.drifts).toEqual([])
  })

  it('splits with largest-remainder rounding and the parts sum to the total', async () => {
    const { backend, household } = seededBackend()
    const api = apiFor(backend, 'u-maya')
    const result = await api.split(
      household.id,
      {
        expenseAccountId: backend.accountOf(household.id, 'EXPENSE:FUN').id,
        totalMinor: 1_000,
        description: 'Pizza',
        shares: ['u-maya', 'u-sam', 'u-ada'].map((u) => ({
          accountId: backend.accountOf(household.id, `POT:${u}`).id,
          weight: 1,
        })),
      },
      's1',
    )
    expect(result.allocations.map((a) => a.shareMinor)).toEqual([334, 333, 333])
  })

  it('forbids self-approval and double decisions', async () => {
    const { backend, household } = seededBackend()
    const sam = apiFor(backend, 'u-sam')
    const pending = (await sam.listApprovals(household.id, 'PENDING_APPROVAL'))[0]!
    expect(pending.requestedByUid).toBe('u-sam')
    const dev = apiFor(backend, 'u-dev')
    expect(code(await failure(sam.approve(household.id, pending.id, 'a1')))).toBe(
      'ROLE_NOT_ALLOWED',
    )
    await dev.approve(household.id, pending.id, 'a2')
    const again = await failure(apiFor(backend, 'u-maya').approve(household.id, pending.id, 'a3'))
    expect(again.status).toBe(409)
    expect(code(again)).toBe('ALREADY_DECIDED')
  })

  it('reports SELF_APPROVAL for an approver approving their own request', async () => {
    const { backend, household } = seededBackend()
    const dev = apiFor(backend, 'u-dev')
    const res = await dev.spend(
      household.id,
      {
        fromAccountId: backend.accountOf(household.id, 'POOL').id,
        categoryAccountId: backend.accountOf(household.id, 'EXPENSE:GENERAL').id,
        amountMinor: 20_000,
        description: 'Fridge',
      },
      'dev-spend',
    )
    expect(res.status).toBe('PENDING_APPROVAL')
    const err = await failure(dev.approve(household.id, res.approval!.id, 'dev-approve'))
    expect(err.status).toBe(403)
    expect(code(err)).toBe('SELF_APPROVAL')
  })

  it('reverses once, mirrors every posting, and refuses a second reversal', async () => {
    const { backend, household } = seededBackend()
    const api = apiFor(backend, 'u-maya')
    const entry = await api.deposit(
      household.id,
      {
        toAccountId: backend.accountOf(household.id, 'POOL').id,
        incomeAccountId: null,
        amountMinor: 700,
        description: 'Oops',
      },
      'd1',
    )
    const before = backend.balanceOf(household.id, 'POOL')
    const reversal = await api.reverse(household.id, entry.id, 'typo', 'r1')
    expect(reversal.kind).toBe('REVERSAL')
    expect(reversal.reversesEntryId).toBe(entry.id)
    expect(reversal.postings.map((p) => p.amountMinor)).toEqual(
      entry.postings.map((p) => -p.amountMinor),
    )
    expect(reversal.description).toBe('Reversal of: Oops (typo)')
    expect(backend.balanceOf(household.id, 'POOL')).toBe(before - 700)
    expect(code(await failure(api.reverse(household.id, entry.id, null, 'r2')))).toBe(
      'ALREADY_REVERSED',
    )
    expect(code(await failure(api.reverse(household.id, reversal.id, null, 'r3')))).toBe(
      'CANNOT_REVERSE_REVERSAL',
    )
  })

  it('lets only trusted roles reverse and read entries; kids see only their own account', async () => {
    const { backend, household } = seededBackend()
    const sam = apiFor(backend, 'u-sam')
    const some = (await apiFor(backend, 'u-maya').listEntries(household.id, 0, 1))[0]!
    expect(code(await failure(sam.reverse(household.id, some.id, null, 'x')))).toBe(
      'ROLE_NOT_ALLOWED',
    )
    const ada = apiFor(backend, 'u-ada')
    expect((await failure(ada.listEntries(household.id, 0, 5))).status).toBe(403)
    const adaPot = backend.accountOf(household.id, 'POT:u-ada').id
    expect(
      (
        await failure(
          ada.statement(household.id, backend.accountOf(household.id, 'POT:u-sam').id, {}),
        )
      ).status,
    ).toBe(404)
    await expect(ada.statement(household.id, adaPot, {})).resolves.toBeTruthy()
  })
})

describe('mock backend: statement and CSV', () => {
  it('computes the running balance over the whole history, regardless of filter or page', async () => {
    const { backend, household } = seededBackend()
    const api = apiFor(backend, 'u-maya')
    const pool = backend.accountOf(household.id, 'POOL').id
    const all = await api.statement(household.id, pool, { size: 500 })
    expect(all.rows.at(-1)!.balanceMinor).toBe(all.currentBalanceMinor)
    let running = 0
    for (const row of all.rows) {
      running += row.amountMinor
      expect(row.balanceMinor).toBe(running)
    }
    const page2 = await api.statement(household.id, pool, { page: 1, size: 5 })
    expect(page2.rows.map((r) => r.balanceMinor)).toEqual(
      all.rows.slice(5, 10).map((r) => r.balanceMinor),
    )
    expect(page2.totalRows).toBe(all.totalRows)
  })

  it('filters with from inclusive and to exclusive', async () => {
    const { backend, household } = seededBackend()
    const api = apiFor(backend, 'u-maya')
    const pool = backend.accountOf(household.id, 'POOL').id
    const all = await api.statement(household.id, pool, { size: 500 })
    const cut = all.rows[3]!.postedAt
    const from = await api.statement(household.id, pool, { from: cut, size: 500 })
    expect(from.rows[0]!.postedAt >= cut).toBe(true)
    const to = await api.statement(household.id, pool, { to: cut, size: 500 })
    expect(to.rows.every((r) => r.postedAt < cut)).toBe(true)
    expect(from.totalRows + to.totalRows).toBe(all.totalRows)
  })

  it('exports CSV with a header, decimal amounts and neutralised formulas', async () => {
    const { backend, household } = seededBackend()
    const api = apiFor(backend, 'u-maya')
    const pool = backend.accountOf(household.id, 'POOL')
    await api.deposit(
      household.id,
      {
        toAccountId: pool.id,
        incomeAccountId: null,
        amountMinor: 12_345,
        description: '=HYPERLINK("x"),evil',
      },
      'csv-1',
    )
    const csv = await api.statementCsv(household.id, pool.id, {})
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('posted_at,entry_id,kind,description,amount,balance,currency')
    expect(csv.endsWith('\r\n')).toBe(true)
    const last = lines.at(-2)!
    expect(last).toContain(`"'=HYPERLINK(""x""),evil"`)
    expect(last).toContain(',123.45,')
    expect(last.endsWith(',USD')).toBe(true)
  })

  it('quotes CSV cells like the backend', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('@x')).toBe("'@x")
    expect(csvCell('-1')).toBe("'-1")
  })
})

describe('mock backend: reconciliation and allowances', () => {
  it('reports drift per account when the projection disagrees with the ledger', async () => {
    const { backend, household } = seededBackend()
    backend.injectDrift(household.id, 'POOL', 500)
    const report = await apiFor(backend, 'u-maya').reconcile(household.id)
    expect(report.consistent).toBe(false)
    expect(report.drifts).toHaveLength(1)
    expect(report.drifts[0]).toMatchObject({ code: 'POOL', driftMinor: 500 })
  })

  it('validates allowance schedules like the service', async () => {
    const { backend, household } = seededBackend()
    const api = apiFor(backend, 'u-maya')
    const ada = backend.accountOf(household.id, 'POT:u-ada').id
    const err = await failure(
      api.createSchedule(household.id, {
        fromAccountId: null,
        toAccountId: ada,
        amountMinor: 500,
        frequency: 'WEEKLY',
        startDate: '2026-11-01',
        description: 'Old',
      }),
    )
    expect(code(err)).toBe('START_IN_PAST')
    const created = await api.createSchedule(household.id, {
      fromAccountId: null,
      toAccountId: ada,
      amountMinor: 500,
      frequency: 'WEEKLY',
      startDate: '2026-11-20',
      description: 'Extra',
    })
    expect(created).toMatchObject({ active: true, nextDueOn: '2026-11-20' })
    expect(
      code(
        await failure(
          apiFor(backend, 'u-dev').createSchedule(household.id, {
            fromAccountId: null,
            toAccountId: ada,
            amountMinor: 500,
            frequency: 'WEEKLY',
            startDate: '2026-11-20',
            description: 'x',
          }),
        ),
      ),
    ).toBe('ROLE_NOT_ALLOWED')
  })

  it('serves the run log as "date STATUS" lines including SKIPPED and FAILED', async () => {
    const { backend, household } = seededBackend()
    const api = apiFor(backend, 'u-maya')
    const schedules = await api.listSchedules(household.id)
    const statuses = new Set<string>()
    for (const s of schedules)
      for (const run of await api.listRuns(household.id, s.id)) statuses.add(run.status)
    expect([...statuses].sort()).toEqual(['FAILED', 'PAID', 'SKIPPED'])
  })
})
