import { describe, expect, it } from 'vitest'
import { apiFor } from '../../test/fixtures'
import {
  renderApp,
  screen,
  switchPersona,
  waitFor,
  waitForHeading,
  within,
} from '../../test/renderApp'

describe('sign-in and first use', () => {
  it('lets you pick a demo persona with no setup, then lands on the household dashboard', async () => {
    const { user } = renderApp({ uid: null, path: '/' })
    await user.click(await screen.findByRole('button', { name: /continue as maya okafor/i }))
    expect(await waitForHeading('Okafor family')).toBeInTheDocument()
  })

  it('says on first use that no real money moves, and remembers the acknowledgement', async () => {
    const { user } = renderApp({ firstUse: true })
    const dialog = await screen.findByRole('dialog', { name: /this is bookkeeping, not a bank/i })
    expect(within(dialog).getByText(/no bank, card or payment connection/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'I understand' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('ft:intro-seen:u-maya')).toBe('yes')
    expect(screen.getByText(/no real money ever moves/i)).toBeInTheDocument()
  })
})

describe('dashboard', () => {
  it('shows the pool, member pots, pending approvals, upcoming allowances and recent activity', async () => {
    renderApp()
    await waitForHeading('Okafor family')
    expect(
      screen.getByText(/spends above \$100\.00 need a second person to approve/i),
    ).toBeInTheDocument()

    const pool = screen.getByRole('group', { name: 'Shared pool' })
    expect(within(pool).getByText('$2,170.30')).toBeInTheDocument()
    const hero = screen.getByRole('region', { name: /shared pool/i })
    expect(within(hero).getByRole('link', { name: 'Move money' })).toBeInTheDocument()

    const approvals = await screen.findByRole('region', { name: 'Waiting for approval' })
    expect(within(approvals).getByText('1 request')).toBeInTheDocument()
    expect(
      within(approvals).getByRole('heading', { name: 'Winter coats for the kids' }),
    ).toBeInTheDocument()

    const pots = screen
      .getByRole('heading', { name: 'Member pots' })
      .closest('section') as HTMLElement
    for (const [name, balance] of [
      ['Maya Okafor', '$66.66'],
      ['Dev Okafor', '$0.00'],
      ['Sam Okafor', '$51.67'],
      ['Ada Okafor', '$26.67'],
    ] as const) {
      const card = within(pots).getByText(name, { exact: false }).closest('li')!
      expect(within(card).getByText(balance)).toBeInTheDocument()
    }

    expect(await screen.findByRole('heading', { name: 'Upcoming allowances' })).toBeInTheDocument()
    expect(await screen.findByText(/weekly, next on nov 21, 2026/i)).toBeInTheDocument()
    expect(screen.getByText('Garage sale proceeds')).toBeInTheDocument()
  })

  it('shows a skeleton while loading, then the content', async () => {
    renderApp()
    expect(await screen.findByText('Loading household')).toBeInTheDocument()
    await waitForHeading('Okafor family')
  })

  it('shows an error with a retry when the household cannot be loaded', async () => {
    const { user, backend, householdId } = renderApp({
      prepare: (b, id) => b.breakRoute(new RegExp(`^/households/${id}$`)),
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(/we could not open this household/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/server had a problem/i)
    backend.repair()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await waitForHeading('Okafor family')).toBeInTheDocument()
    expect(
      backend.requests.filter((r) => r.path === `/households/${householdId}`).length,
    ).toBeGreaterThanOrEqual(2)
  })
})

describe('households', () => {
  it('switches between households and formats each in its own currency', async () => {
    const { user } = renderApp()
    await waitForHeading('Okafor family')
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Household' }),
      'Lisbon trip',
    )
    expect(await waitForHeading('Lisbon trip')).toBeInTheDocument()
    expect(await screen.findByText('€760.10')).toBeInTheDocument()
    expect(screen.getByText(/no approval limit/i)).toBeInTheDocument()
  })

  it('sends a brand new user to set up a household, then opens it', async () => {
    const { user, backend } = renderApp({ uid: 'u-ada', path: '/', seed: false })
    expect(await waitForHeading('Set up your household')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create household' }))
    expect(await screen.findByText('Give the household a name.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/household name/i), 'Ada and friends')
    await user.type(screen.getByLabelText(/approval limit/i), '50')
    await user.click(screen.getByRole('button', { name: 'Create household' }))

    expect(await waitForHeading('Ada and friends')).toBeInTheDocument()
    const created = backend.households[0]!
    expect(created).toMatchObject({
      name: 'Ada and friends',
      approvalThresholdMinor: 5000,
      currency: 'USD',
    })
    expect(screen.getByText(/spends above \$50\.00/i)).toBeInTheDocument()
  })

  it('validates the approval limit before calling the server', async () => {
    const { user, backend } = renderApp({ uid: 'u-ada', path: '/welcome', seed: false })
    await waitForHeading('Set up your household')
    await user.type(screen.getByLabelText(/household name/i), 'X')
    await user.type(screen.getByLabelText(/approval limit/i), '1.234')
    await user.click(screen.getByRole('button', { name: 'Create household' }))
    expect(await screen.findByText(/at most 2 decimal places/i)).toBeInTheDocument()
    expect(backend.requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  })
})

describe('demo persona switcher', () => {
  it('plays another member without signing out, and drops the previous person’s data', async () => {
    const { user, backend, householdId } = renderApp()
    await waitForHeading('Okafor family')
    expect(screen.getByRole('link', { name: 'Reconciliation' })).toBeInTheDocument()
    await switchPersona(user, 'Ada Okafor')
    expect(
      await screen.findByRole('heading', { level: 1, name: /hi ada okafor/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Reconciliation' })).not.toBeInTheDocument()
    expect(screen.queryByText('Shared pool')).not.toBeInTheDocument()
    await waitFor(() => expect(backend.requests.some((r) => r.uid === 'u-ada')).toBe(true))
    expect(await apiFor(backend, 'u-ada').getHousehold(householdId)).toBeTruthy()
  })
})
