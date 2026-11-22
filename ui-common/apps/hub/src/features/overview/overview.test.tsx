import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderModule } from '../../test/renderModule'
import { nextStep } from './nextStep'
import { pickPrimary } from './OverviewPage'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const pathOf = (input: Parameters<typeof fetch>[0]) =>
  new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    .pathname

describe('overview states', () => {
  it('explains households to someone in none, with both ways in', async () => {
    const empty: typeof fetch = () => Promise.resolve(json([]))
    const { user } = renderModule({ fetch: empty })
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Share the small stuff with the people you live with',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome' })).toBeInTheDocument()
    // The three things a household gives you, in plain words.
    const points = screen.getByRole('list', { name: 'What you can do in a household' })
    expect(within(points).getAllByRole('listitem')).toHaveLength(3)
    expect(within(points).getByText(/Reminders everyone sees/)).toBeInTheDocument()
    expect(within(points).getByText(/Files you can hand over for a while/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Join with a code' }))
    expect(screen.getByRole('dialog', { name: 'Join with an invite code' })).toBeInTheDocument()
  })

  it('shows the people, the figures, what is coming up and what happened lately', async () => {
    renderModule()
    const panel = await screen.findByRole('region', { name: 'Rivera household' })
    expect(within(panel).getAllByText('Owner').length).toBeGreaterThan(0)
    const members = await within(panel).findByRole('list', { name: 'Members' })
    expect(within(members).getAllByRole('listitem')).toHaveLength(2)
    expect(within(members).getByText('Demo User')).toBeInTheDocument()
    expect(within(members).getByText('You')).toBeInTheDocument()
    expect(within(members).getByText('Bob Rivera')).toBeInTheDocument()
    expect(within(panel).getByText(/You share it with Bob Rivera/)).toBeInTheDocument()

    const stat = (label: string) => screen.getByRole('region', { name: label })
    expect(stat('People you share with')).toHaveTextContent('1')
    expect(stat('Reminders due this week')).toHaveTextContent(/[0-9]/)
    expect(stat('Files shared')).toHaveTextContent('1')

    const coming = (await screen.findByRole('heading', { name: 'Coming up' })).closest('section')!
    expect(await within(coming).findByText('Water the plants')).toBeInTheDocument()
    const lately = screen.getByRole('heading', { name: /Lately in/ }).closest('section')!
    expect(await within(lately).findByText('Home insurance summary.txt (77 B)')).toBeInTheDocument()
  })

  it('names one next step with a button that leads there', async () => {
    renderModule()
    const panel = await screen.findByRole('region', { name: 'Rivera household' })
    // The seeded household has people, reminders and a file, so the step is to look at the list.
    expect(await within(panel).findByText(/Next up on the list/)).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'See reminders' })).toHaveAttribute(
      'href',
      '/app/core/reminders',
    )
  })

  it('invites someone first when the household is only you', async () => {
    const alone: typeof fetch = (input) => {
      const path = pathOf(input)
      if (path.endsWith('/v1/households'))
        return Promise.resolve(
          json([{ id: 'h1', name: 'Just me', role: 'OWNER', createdAt: '2026-10-01T00:00:00Z' }]),
        )
      if (path.endsWith('/v1/households/h1'))
        return Promise.resolve(
          json({
            id: 'h1',
            name: 'Just me',
            createdAt: '2026-10-01T00:00:00Z',
            callerRole: 'OWNER',
            members: [{ uid: 'demo-user', role: 'OWNER', joinedAt: '2026-10-01T00:00:00Z' }],
          }),
        )
      if (path.endsWith('/v1/audit'))
        return Promise.resolve(json({ items: [], page: 0, size: 5, total: 0 }))
      return Promise.resolve(json([]))
    }
    renderModule({ fetch: alone })
    const panel = await screen.findByRole('region', { name: 'Just me' })
    expect(await within(panel).findByText(/It is just you so far/)).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Invite someone' })).toHaveAttribute(
      'href',
      '/app/core/households/h1',
    )
    expect(await screen.findByText('Nothing due')).toBeInTheDocument()
    expect(screen.getByText('Nothing has happened here yet.')).toBeInTheDocument()
  })

  it('warns about overdue reminders', async () => {
    const overdue: typeof fetch = (input) => {
      const path = pathOf(input)
      if (path.endsWith('/v1/households'))
        return Promise.resolve(
          json([{ id: 'h1', name: 'Home', role: 'OWNER', createdAt: '2026-10-01T00:00:00Z' }]),
        )
      if (path.endsWith('/v1/households/h1'))
        return Promise.resolve(
          json({
            id: 'h1',
            name: 'Home',
            createdAt: '2026-10-01T00:00:00Z',
            callerRole: 'OWNER',
            members: [{ uid: 'demo-user', role: 'OWNER', joinedAt: '2026-10-01T00:00:00Z' }],
          }),
        )
      if (path.endsWith('/v1/reminders'))
        return Promise.resolve(
          json([
            {
              id: 'r1',
              ownerUid: 'demo-user',
              householdId: 'h1',
              title: 'Renew the licence',
              dueAt: '2020-01-01T09:00:00Z',
              recurrence: null,
              status: 'ACTIVE',
              lastFiredAt: null,
              createdAt: '2019-12-01T09:00:00Z',
            },
          ]),
        )
      if (path.endsWith('/v1/audit'))
        return Promise.resolve(json({ items: [], page: 0, size: 5, total: 0 }))
      return Promise.resolve(json([]))
    }
    renderModule({ fetch: overdue })
    const callout = await screen.findByRole('alert')
    expect(callout).toHaveTextContent('1 reminder is overdue')
    expect(callout).toHaveTextContent('Renew the licence')
  })

  it('shows a retryable error when the households cannot be loaded', async () => {
    let failing = true
    const flaky: typeof fetch = (input) => {
      if (failing && pathOf(input).endsWith('/v1/households'))
        return Promise.resolve(json({ title: 'Error', status: 503, detail: 'Shared is down' }, 503))
      return Promise.resolve(json([]))
    }
    const { user } = renderModule({ fetch: flaky })
    expect(await screen.findByText('Shared is down')).toBeInTheDocument()
    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', {
        name: 'Share the small stuff with the people you live with',
      }),
    ).toBeInTheDocument()
  })

  it('shows a skeleton while loading', () => {
    const never: typeof fetch = () => new Promise(() => {})
    renderModule({ fetch: never })
    expect(screen.getByLabelText('Loading your household')).toHaveAttribute('aria-busy', 'true')
  })
})

describe('nextStep', () => {
  const base = {
    householdId: 'h1',
    callerRole: 'OWNER' as const,
    memberCount: 3,
    activeReminders: 2,
    files: 1,
  }
  it('asks an owner who is alone to invite someone', () => {
    expect(nextStep({ ...base, memberCount: 1 })).toMatchObject({
      label: 'Invite someone',
      to: '/households/h1',
    })
  })
  it('does not ask a lone member to invite (they cannot)', () => {
    expect(
      nextStep({ ...base, callerRole: 'MEMBER', memberCount: 1, activeReminders: 0 }).label,
    ).toBe('Add a reminder')
  })
  it('then asks for a first reminder, then a first file', () => {
    expect(nextStep({ ...base, activeReminders: 0 })).toMatchObject({ to: '/reminders' })
    expect(nextStep({ ...base, files: 0 })).toMatchObject({ label: 'Add a file', to: '/files' })
  })
  it('names the next reminder when all is set up', () => {
    expect(nextStep({ ...base, nextReminderTitle: 'Pay the rent' }).text).toContain('Pay the rent')
  })
})

describe('pickPrimary', () => {
  const h = (id: string, role: 'OWNER' | 'MEMBER', createdAt: string) => ({
    id,
    name: id,
    role,
    createdAt,
  })
  it('prefers a household you own, then the oldest', () => {
    expect(
      pickPrimary([
        h('a', 'MEMBER', '2026-01-01'),
        h('b', 'OWNER', '2026-03-01'),
        h('c', 'OWNER', '2026-02-01'),
      ])?.id,
    ).toBe('c')
    expect(pickPrimary([h('a', 'MEMBER', '2026-02-01'), h('b', 'MEMBER', '2026-01-01')])?.id).toBe(
      'b',
    )
    expect(pickPrimary([])).toBeUndefined()
  })
})
