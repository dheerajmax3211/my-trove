import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTodayItems } from './today'
import { renderModule } from './test/renderModule'

function Probe() {
  const { items, loading } = useTodayItems()
  return <pre data-testid="today">{JSON.stringify({ items, loading })}</pre>
}

interface Result {
  items: {
    id: string
    title: string
    subtitle?: string
    severity: string
    to: string
    dueAt?: string
  }[]
  loading: boolean
}

async function today(options: Parameters<typeof renderModule>[0] = {}) {
  const rendered = renderModule({ ...options, beside: <Probe /> })
  const read = (): Result => JSON.parse(screen.getByTestId('today').textContent ?? '{}') as Result
  await waitFor(() => expect(read().loading).toBe(false))
  // let the per-household queries settle
  await waitFor(() => expect(read().loading).toBe(false))
  await new Promise((r) => setTimeout(r, 80))
  return { ...rendered, read }
}

describe('useTodayItems', () => {
  it('gives an owner the request to decide, the allowance due soon, and nothing else when the ledger is fine', async () => {
    const { read, householdId } = await today()
    const { items } = read()
    const bySeverity = (s: string) => items.filter((i) => i.severity === s)

    expect(bySeverity('warn')).toHaveLength(1)
    expect(bySeverity('warn')[0]).toMatchObject({
      title: 'Decide on $180.00: Winter coats for the kids',
      subtitle: 'Okafor family. Requested by Sam Okafor',
      to: `/h/${householdId}/approvals`,
    })
    expect(bySeverity('warn')[0]!.dueAt).toBeTruthy()

    // Ada's weekly allowance is due on 21 Nov, three days after the fixed clock; Sam's monthly one is not due yet
    expect(bySeverity('info').map((i) => i.title)).toEqual(['$10.00 allowance for Ada Okafor pot'])
    expect(bySeverity('info')[0]).toMatchObject({ to: `/h/${householdId}/allowances` })
    expect(bySeverity('danger')).toHaveLength(0)
  })

  it('raises a danger item for the owner when the ledger check finds a mismatch', async () => {
    const { read, householdId } = await today({
      prepare: (backend, id) => backend.injectDrift(id, 'POOL', 500),
    })
    const danger = read().items.filter((i) => i.severity === 'danger')
    expect(danger).toHaveLength(1)
    expect(danger[0]).toMatchObject({
      id: `reconciliation:${householdId}`,
      to: `/h/${householdId}/reconciliation`,
    })
  })

  it('shows an approver the request and the allowance but never the owner-only ledger check', async () => {
    const { read } = await today({
      uid: 'u-dev',
      prepare: (backend, id) => backend.injectDrift(id, 'POOL', 500),
    })
    const items = read().items
    expect(items.map((i) => i.severity).sort()).toEqual(['info', 'warn'])
  })

  it('shows nothing to decide for a member or a kid', async () => {
    for (const uid of ['u-sam', 'u-ada']) {
      const { read, unmount } = await today({ uid })
      expect(read().items).toEqual([])
      unmount()
    }
  })

  it('never lists your own request as waiting for you', async () => {
    const { read } = await today({
      uid: 'u-dev',
      prepare: (backend, id) => {
        const household = backend.households.find((h) => h.id === id)!
        backend.createApproval(household, 'u-dev', 'Dev wants a drill', 15_000)
      },
    })
    const titles = read().items.map((i) => i.title)
    expect(titles).toContain('Decide on $180.00: Winter coats for the kids')
    expect(titles.some((t) => t.includes('drill'))).toBe(false)
  })

  it('is stable: the same data gives the same items, with module-relative links', async () => {
    const { read, queryClient } = await today()
    const first = JSON.stringify(read().items)
    await queryClient.invalidateQueries()
    await new Promise((r) => setTimeout(r, 80))
    expect(JSON.stringify(read().items)).toBe(first)
    for (const item of read().items) expect(item.to.startsWith('/h/')).toBe(true)
    expect(new Set(read().items.map((i) => i.id)).size).toBe(read().items.length)
  })

  it('reports loading, then no items for someone with no household', async () => {
    const { read } = await today({ uid: 'u-ada', seed: false })
    expect(read()).toEqual({ items: [], loading: false })
  })
})
