import { createSession } from '@platform/workspace-kit'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  callsTo,
  jsonResponse,
  problem,
  renderAdmin,
  sessionFor,
  type RecordedRequest,
} from '../testing/harness'

const spanOf = (r: RecordedRequest) =>
  Date.parse(r.search.get('to') ?? '') - Date.parse(r.search.get('from') ?? '')
const HOUR = 3_600_000

describe('Usage', () => {
  it('shows totals, error rate, latency and active users from the summary', async () => {
    const { requests } = renderAdmin({ route: '/usage' })
    const headline = await screen.findByRole('region', { name: 'Headline numbers' })
    const requestsStat = await within(headline).findByRole('group', { name: 'Requests' })
    expect(requestsStat).toHaveTextContent(/\d{1,3}(,\d{3})*/)
    expect(within(headline).getByRole('group', { name: 'Error rate' })).toHaveTextContent('%')
    expect(within(headline).getByRole('group', { name: 'Latency, p95' })).toHaveTextContent(
      /\d+ ms/,
    )
    expect(within(headline).getByRole('group', { name: 'Latency, p95' })).toHaveTextContent(
      'Median',
    )
    expect(within(headline).getByRole('group', { name: 'Active users' })).toBeInTheDocument()
    // every call goes to the platform service, reached through the same client
    const summaries = callsTo(requests, 'GET', '/v1/usage/summary')
    expect(summaries.length).toBeGreaterThanOrEqual(1)
    expect(summaries.every((r) => r.service === 'platform')).toBe(true)
    expect(spanOf(summaries[0] as RecordedRequest)).toBe(24 * HOUR)
  })

  it('compares with the previous window', async () => {
    const { requests } = renderAdmin({ route: '/usage' })
    await screen.findByRole('group', { name: 'Requests' })
    await waitFor(() => expect(callsTo(requests, 'GET', '/v1/usage/summary')).toHaveLength(2))
    const [now, before] = callsTo(requests, 'GET', '/v1/usage/summary')
    expect(before?.search.get('to')).toBe(now?.search.get('from'))
    expect(await screen.findAllByText(/vs\. the previous 24 hours/)).not.toHaveLength(0)
  })

  it('draws the time series from the fixture, with errors on their own strip and a data table for screen readers', async () => {
    renderAdmin({ route: '/usage' })
    const svg = await screen.findByTestId('usage-chart')
    expect(svg.querySelectorAll('path').length).toBeGreaterThanOrEqual(2) // area + line
    expect(svg.textContent).toContain('Errors per hour')
    const slider = screen.getByRole('slider', { name: /Requests and errors, last 24 hours/ })
    expect(slider).toHaveAttribute('aria-valuemax', '24') // 25 hourly buckets
    const table = screen.getByRole('table', { name: 'Requests and errors, last 24 hours, data' })
    expect(within(table).getAllByRole('row').length).toBe(26)
  })

  it('reads one point with the keyboard', async () => {
    const { user } = renderAdmin({ route: '/usage' })
    const slider = await screen.findByRole('slider', { name: /Requests and errors/ })
    await user.tab() // reaches the range buttons first
    act(() => slider.focus())
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringMatching(/requests, \d+ errors/))
    const last = slider.getAttribute('aria-valuenow')
    await user.keyboard('{ArrowLeft}')
    expect(slider.getAttribute('aria-valuenow')).toBe(String(Number(last) - 1))
    await user.keyboard('{Home}')
    expect(slider).toHaveAttribute('aria-valuenow', '0')
    await user.keyboard('{End}')
    expect(slider).toHaveAttribute('aria-valuenow', last)
    // and a tooltip appears while it is active
    expect(screen.getByText(/requests$/, { selector: 'p' })).toBeInTheDocument()
  })

  it('the range switcher refetches with the new window and keeps it in the URL', async () => {
    const { user, requests } = renderAdmin({ route: '/usage' })
    await screen.findByTestId('usage-chart')
    const group = screen.getByRole('group', { name: 'Time range' })
    expect(within(group).getByRole('button', { name: 'Show the last 24 hours' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(within(group).getByRole('button', { name: 'Show the last 7 days' }))
    await waitFor(() =>
      expect(
        callsTo(requests, 'GET', '/v1/usage/summary').some((r) => spanOf(r) === 7 * 24 * HOUR),
      ).toBe(true),
    )
    await screen.findByRole('slider', { name: /last 7 days/ })
    expect(screen.getByTestId('where')).toHaveTextContent('range=7d')
    expect(within(group).getByRole('button', { name: 'Show the last 7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // top users and "your usage" follow the same window
    await waitFor(() =>
      expect(
        callsTo(requests, 'GET', '/v1/usage/top-users').some((r) => spanOf(r) === 7 * 24 * HOUR),
      ).toBe(true),
    )
    await waitFor(() =>
      expect(
        callsTo(requests, 'GET', '/v1/usage/me').some((r) => spanOf(r) === 7 * 24 * HOUR),
      ).toBe(true),
    )

    await user.click(within(group).getByRole('button', { name: 'Show the last hour' }))
    await waitFor(() =>
      expect(callsTo(requests, 'GET', '/v1/usage/summary').some((r) => spanOf(r) === HOUR)).toBe(
        true,
      ),
    )
    await user.click(within(group).getByRole('button', { name: 'Show the last 30 days' }))
    await waitFor(() =>
      expect(
        callsTo(requests, 'GET', '/v1/usage/summary').some((r) => spanOf(r) === 30 * 24 * HOUR),
      ).toBe(true),
    )
    await screen.findByRole('slider', { name: /last 30 days/ })
  })

  it('opens on the range in the link', async () => {
    const { requests } = renderAdmin({ route: '/usage?range=30d' })
    await screen.findByRole('slider', { name: /last 30 days/ })
    expect(spanOf(callsTo(requests, 'GET', '/v1/usage/summary')[0] as RecordedRequest)).toBe(
      30 * 24 * HOUR,
    )
  })

  it('lists services and status classes with their numbers', async () => {
    renderAdmin({ route: '/usage' })
    const services = await screen.findByRole('table', { name: 'Requests by service' })
    await within(services).findByText('home-pulse')
    expect(within(services).getAllByRole('row')).toHaveLength(7) // header + 6 services
    expect(within(services).getByRole('columnheader', { name: /Error rate/ })).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Share of responses by status class' }),
    ).toBeInTheDocument()
    expect(screen.getByText('2xx Succeeded')).toBeInTheDocument()
    expect(screen.getByText('5xx Failed (server errors)')).toBeInTheDocument()
  })

  it('names the top users with one batched lookup and links each to their page', async () => {
    const { requests } = renderAdmin({ route: '/usage' })
    const list = await screen.findByRole('list', { name: 'Top users by requests' })
    const first = await within(list).findByRole('link', { name: 'Priya Raman' })
    expect(first).toHaveAttribute('href', expect.stringMatching(/^\/app\/admin\/users\/0190d2a4-/))
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
    const lookups = callsTo(requests, 'GET', '/v1/admin/users/lookup')
    expect(lookups).toHaveLength(1)
    expect((lookups[0]?.search.get('ids') ?? '').split(',').length).toBeLessThanOrEqual(100)
    expect(lookups[0]?.service).toBe('auth')
  })

  it('shows Your usage from /v1/usage/me below, for people with usage:read:self', async () => {
    const { requests } = renderAdmin({ route: '/usage', persona: 'ADMIN' })
    expect(await screen.findByRole('heading', { name: 'Your usage' })).toBeInTheDocument()
    await waitFor(() => expect(callsTo(requests, 'GET', '/v1/usage/me').length).toBeGreaterThan(0))
    const mine = (await screen.findByRole('heading', { name: 'Your usage' })).closest(
      'section',
    ) as HTMLElement
    expect(await within(mine).findByRole('group', { name: 'Requests' })).toBeInTheDocument()
    expect(within(mine).queryByRole('group', { name: 'Active users' })).not.toBeInTheDocument()
  })

  it('a role without usage:read:self reads platform usage but has no usage of its own to show', async () => {
    const base = sessionFor('AUDITOR')
    const session = createSession({
      uid: base.uid,
      email: base.email,
      displayName: base.displayName,
      roles: ['AUDITOR'],
      permissions: ['usage:read:all', 'users:read', 'audit:read'],
      plan: 'FREE',
      isDemo: false,
    })
    const { requests } = renderAdmin({ route: '/usage', session })
    await screen.findByTestId('usage-chart')
    expect(screen.queryByRole('heading', { name: 'Your usage' })).not.toBeInTheDocument()
    expect(callsTo(requests, 'GET', '/v1/usage/me')).toHaveLength(0)
  })

  it('a quiet range gets an empty state with a way out', async () => {
    const empty = {
      totalRequests: 0,
      errorRate: 0,
      p50Ms: null,
      p95Ms: null,
      activeUsers: 0,
      byService: [],
      byStatusClass: {},
      series: [],
      from: '2026-11-20T00:00:00Z',
      to: '2026-11-21T00:00:00Z',
      resolution: '1h',
    }
    const { user } = renderAdmin({
      route: '/usage?range=1h',
      intercept: (r) => (r.path === '/v1/usage/summary' ? jsonResponse(empty) : undefined),
    })
    expect(
      await screen.findByRole('heading', { name: 'No requests in the last hour' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('usage-chart')).not.toBeInTheDocument()
    expect(screen.getAllByText('n/a').length).toBeGreaterThan(0) // no latency to report
    await user.click(screen.getByText('Show the last 30 days', { selector: 'button' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('range=30d'))
  })

  it('a 403 from the summary is shown as not allowed', async () => {
    renderAdmin({
      route: '/usage',
      intercept: (r) =>
        r.path === '/v1/usage/summary' ? problem(403, 'Access Denied') : undefined,
    })
    expect(
      await screen.findByRole('heading', { name: 'The platform did not allow this' }),
    ).toBeInTheDocument()
  })

  it('a network error offers a retry', async () => {
    renderAdmin({
      route: '/usage',
      intercept: (r) =>
        r.path.startsWith('/v1/usage') ? Promise.reject(new TypeError('x')) : undefined,
    })
    expect(await screen.findByText("Can't reach the platform")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('if the previous window fails the page still renders, just without deltas', async () => {
    let n = 0
    renderAdmin({
      route: '/usage',
      intercept: (r) =>
        r.path === '/v1/usage/summary' && ++n === 2 ? problem(500, 'nope') : undefined,
    })
    expect(await screen.findByTestId('usage-chart')).toBeInTheDocument()
  })

  it('moving the pointer over the chart reads the nearest point', async () => {
    renderAdmin({ route: '/usage' })
    const svg = await screen.findByTestId('usage-chart')
    svg.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 720,
      height: 300,
      right: 720,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    fireEvent.pointerMove(svg, { clientX: 100, clientY: 50 })
    expect(await screen.findByText(/errors \(/)).toBeInTheDocument()
  })
})
