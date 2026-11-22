import { describe, expect, it } from 'vitest'
import { renderApp, screen, waitFor, waitForHeading, within } from '../../test/renderApp'

describe('dashboard: no household yet', () => {
  it('opens the illustrated welcome, which explains the words before asking for anything', async () => {
    renderApp({ uid: 'u-ada', path: '/', seed: false })
    expect(await waitForHeading('Set up your household')).toBeInTheDocument()
    const terms = within(screen.getByRole('region', { name: /four words/i }))
    for (const term of ['Household', 'Pool', 'Pot', 'Approval']) {
      expect(terms.getByText(term)).toBeInTheDocument()
    }
    expect(screen.getByText('Bookkeeping, not a bank')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create household' })).toBeInTheDocument()
  })
})

describe('dashboard: an empty household', () => {
  it('leads with a zero pool and a clear first step instead of blank panels', async () => {
    const { user } = renderApp({ uid: 'u-ada', path: '/welcome', seed: false })
    await user.type(await screen.findByLabelText(/household name/i), 'Fresh start')
    await user.click(screen.getByRole('button', { name: 'Create household' }))
    await waitForHeading('Fresh start')

    const pool = screen.getByRole('group', { name: 'Shared pool' })
    expect(within(pool).getAllByText('$0.00').length).toBeGreaterThan(0)
    expect(within(pool).getByText(/nothing recorded yet/i)).toBeInTheDocument()
    const hero = screen.getByRole('region', { name: /shared pool/i })
    expect(within(hero).getByRole('link', { name: 'Move money' })).toBeInTheDocument()

    expect(await screen.findByText('Nothing recorded yet', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Record a deposit' })).toHaveAttribute(
      'href',
      expect.stringContaining('tab=deposit'),
    )
    expect(await screen.findByText(/sets no limit on spends/i)).toBeInTheDocument()
    expect(await screen.findByText('No allowances scheduled')).toBeInTheDocument()
  })
})

describe('dashboard: populated', () => {
  it('shows the balance history, the pots with shares, and the activity as a timeline', async () => {
    renderApp()
    await waitForHeading('Okafor family')
    expect(
      await screen.findByRole('img', {
        name: /shared pool balance after each of the last 19 entries/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/over the last 19 entries/i)).toBeInTheDocument()

    const timeline = await screen.findByRole('list', { name: 'Recent ledger entries' })
    expect(within(timeline).getAllByRole('listitem').length).toBeGreaterThanOrEqual(5)
    expect(within(timeline).getByText('Garage sale proceeds')).toBeInTheDocument()

    expect(await screen.findAllByRole('progressbar', { name: 'Share of all pots' })).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Statement for Ada Okafor' })).toBeInTheDocument()
  })

  it('keeps the bookkeeping-only statement on screen', async () => {
    renderApp()
    await waitForHeading('Okafor family')
    expect(screen.getByText(/bookkeeping only\./i, { selector: 'strong' })).toBeInTheDocument()
  })
})

describe('dashboard: pending approvals', () => {
  it('makes the request unmissable, with who asked, how much, why and when it expires', async () => {
    renderApp({ uid: 'u-dev' })
    const area = await screen.findByRole('region', { name: 'Waiting for approval' })
    expect(await within(area).findByText('1 request')).toBeInTheDocument()
    expect(
      await within(area).findByRole('heading', { name: 'Winter coats for the kids' }),
    ).toBeInTheDocument()
    expect(within(area).getByText('$180.00')).toBeInTheDocument()
    expect(within(area).getByText(/requested by sam okafor/i)).toBeInTheDocument()
    expect(within(area).getByText(/expires in 3 days/i)).toBeInTheDocument()
  })

  it('lets an approver decide right from the dashboard, then goes calm', async () => {
    const { user, backend, householdId } = renderApp({ uid: 'u-dev' })
    await user.click(await screen.findByRole('button', { name: /approve winter coats/i }))
    expect(await screen.findByText('Approved and recorded')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /approve winter coats/i }),
      ).not.toBeInTheDocument(),
    )
    expect(await screen.findByText(/nothing is waiting/i)).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_030 - 18_000)
  }, 20_000)

  it('shows a member the request without any way to decide it', async () => {
    renderApp({ uid: 'u-sam' })
    const area = await screen.findByRole('region', { name: 'Waiting for approval' })
    expect(within(area).queryByRole('button', { name: /^approve/i })).not.toBeInTheDocument()
    expect(
      await within(area).findByText(/only an owner or approver can decide/i),
    ).toBeInTheDocument()
  })
})

describe('dashboard: errors', () => {
  it('says what failed in the approvals area and offers a retry, leaving the rest usable', async () => {
    const { user, backend } = renderApp({
      prepare: (b) => b.breakRoute(/\/approvals$/),
    })
    await waitForHeading('Okafor family')
    expect(await screen.findByText('We could not load the requests')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Shared pool' })).toBeInTheDocument()
    backend.repair()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('region', { name: 'Waiting for approval' })).toBeInTheDocument()
  })
})
