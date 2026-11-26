import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  fakeModule,
  json,
  meFor,
  problem,
  renderDemo,
  renderLive,
  type Handler,
  urlOf,
} from '../../testing/harness'

describe('Today feed', () => {
  const alpha = fakeModule('alpha', {
    todayItems: [
      {
        id: 'a1',
        title: 'Chase the refund',
        subtitle: 'Acme Ltd',
        severity: 'warn',
        dueAt: '2026-11-23T09:00:00',
        to: '/detail',
      },
      {
        id: 'a2',
        title: 'Water leak alert',
        severity: 'danger',
        dueAt: '2026-11-21T08:00:00',
        to: '/',
      },
    ],
  })
  const beta = fakeModule('beta', {
    todayItems: [
      {
        id: 'b1',
        title: 'Renew passport',
        severity: 'info',
        dueAt: '2026-12-30T00:00:00',
        to: '/detail',
      },
      {
        id: 'b2',
        title: 'Approve allowance',
        severity: 'danger',
        dueAt: '2026-11-20T08:00:00',
        to: '/detail',
      },
    ],
  })

  it('greets by time of day and by first name', async () => {
    renderDemo('MEMBER', { modules: [alpha], now: new Date('2026-11-21T08:30:00') })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Good morning, Demo' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Saturday, November 21/)).toBeInTheDocument()
  })

  it('merges every module feed, most severe and soonest first, each linking into its module', async () => {
    renderDemo('MEMBER', { modules: [alpha, beta] })
    const list = await screen.findByRole('list', { name: 'Items that need you' })
    const rows = within(list).getAllByRole('listitem')
    expect(
      rows.map((row) => within(row).getByText(/Chase|Water|Renew|Approve/).textContent),
    ).toEqual([
      'Approve allowance', // danger, overdue
      'Water leak alert', // danger, due earlier than nothing else but later than b2
      'Chase the refund', // warn
      'Renew passport', // info
    ])
    expect(within(rows[0]!).getByRole('link')).toHaveAttribute('href', '/app/beta/detail')
    expect(within(rows[1]!).getByRole('link')).toHaveAttribute('href', '/app/alpha')
    expect(within(rows[2]!).getByRole('link')).toHaveAttribute('href', '/app/alpha/detail')
    // severity is a word, not only a colour; due dates are spoken in days
    expect(within(rows[0]!).getByText('Urgent')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Overdue by 1 day')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Soon')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Due in 2 days')).toBeInTheDocument()
  })

  it('leaves out modules the role may not use', async () => {
    renderDemo('AUDITOR', { modules: [alpha, beta] })
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('list', { name: 'Items that need you' })).not.toBeInTheDocument()
    expect(screen.queryByText('Chase the refund')).not.toBeInTheDocument()
  })

  it('survives a module whose feed hook throws', async () => {
    const broken = fakeModule('broken', {
      useTodayItems: () => {
        throw new Error('boom')
      },
    })
    const spy = console.error
    console.error = () => {}
    try {
      renderDemo('MEMBER', { modules: [broken, alpha] })
      expect(await screen.findByText('Water leak alert')).toBeInTheDocument()
    } finally {
      console.error = spy
    }
  })

  it('teaches when there is nothing to show, with one next action', async () => {
    renderDemo('MEMBER', {
      modules: [fakeModule('alpha', { todayItems: [] })],
      onboarded: ['alpha'],
    })
    expect(
      await screen.findByRole('heading', { name: 'Nothing needs you right now' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/When a product has something for you, it shows up here/),
    ).toBeInTheDocument()
    // the call to action in the empty state, and the same step among the quick actions
    const actions = screen.getAllByRole('link', { name: 'Open Alpha' })
    expect(actions).toHaveLength(2)
    for (const action of actions) expect(action).toHaveAttribute('href', '/app/alpha')
  })

  it('offers quick actions for the pinned products first', async () => {
    renderDemo('MEMBER', {
      modules: [fakeModule('alpha'), fakeModule('beta')],
      onboarded: ['beta'],
    })
    const quick = await screen.findByRole('region', { name: 'Start something' })
    expect(
      within(quick)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Open Beta', 'Open Alpha'])
  })
})

describe('plan and usage', () => {
  const usage =
    (body: unknown): Handler =>
    (url) =>
      url.pathname.endsWith('/platform/v1/usage/me')
        ? body instanceof Response
          ? body
          : json(body)
        : undefined

  it("shows this month's activity, not a quota: the workspace is never limited by the plan", async () => {
    renderLive({
      persona: 'MEMBER',
      handler: usage({
        totalRequests: 4210,
        series: [
          { ts: 'a', requests: 1 },
          { ts: 'b', requests: 3 },
        ],
      }),
    })
    const plan = await screen.findByRole('region', { name: 'Your plan' })
    expect(await within(plan).findByText('4,210')).toBeInTheDocument()
    expect(within(plan).getByText('requests across your products this month')).toBeInTheDocument()
    expect(
      within(plan).getByText('Using your workspace is never limited by your plan.'),
    ).toBeInTheDocument()
    expect(within(plan).getByText('Free')).toBeInTheDocument()
    expect(within(plan).queryByRole('meter')).not.toBeInTheDocument()
  })

  it('states the plan limits as applying to apps and API keys', async () => {
    renderLive({
      me: () => meFor('MEMBER', { plan: 'PRO' }),
      handler: usage({ totalRequests: 100_000 }),
    })
    const plan = await screen.findByRole('region', { name: 'Your plan' })
    expect(
      await within(plan).findByText(
        /For apps and API keys: up to 600 requests a minute and 200,000 a month/,
      ),
    ).toBeInTheDocument()
  })

  it('asks for the usage of the current month only', async () => {
    const { fetchMock } = renderLive({ handler: usage({ totalRequests: 1 }) })
    await screen.findByText('requests across your products this month')
    const call = fetchMock.mock.calls.find(([u]) => urlOf(u).includes('/platform/v1/usage/me'))
    expect(urlOf(call![0])).toBe(
      'http://localhost:8080/api/platform/v1/usage/me?from=2026-11-01T00%3A00%3A00.000Z',
    )
  })

  it('never warns a person in the workspace about a limit, however busy the month', async () => {
    renderLive({ handler: usage({ totalRequests: 12_000 }) })
    expect(await screen.findByText('12,000')).toBeInTheDocument()
    expect(
      screen.queryByText(/over the monthly limit|refused|Close to the monthly limit/),
    ).not.toBeInTheDocument()
  })

  it.each([
    [403, /does not include usage numbers/],
    [404, /not being counted for this workspace yet/],
    [500, /could not load your usage/],
  ])('handles a %s without breaking the page', async (status, message) => {
    renderLive({
      modules: [fakeModule('alpha', { todayItems: [] })],
      handler: usage(problem(status)),
    })
    expect(await screen.findByText(message)).toBeInTheDocument()
    // the rest of Today is intact
    expect(screen.getByRole('heading', { name: 'Needs you' })).toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
  })

  it('does not ask for usage a role does not have, and points an auditor to Admin', async () => {
    const { fetchMock } = renderLive({ persona: 'AUDITOR' })
    expect(await screen.findByText(/Platform-wide numbers are in/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/app/admin/usage')
    expect(fetchMock.mock.calls.some(([u]) => urlOf(u).includes('usage/me'))).toBe(false)
  })
})
