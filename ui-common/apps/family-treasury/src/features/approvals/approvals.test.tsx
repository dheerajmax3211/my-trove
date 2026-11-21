import { describe, expect, it } from 'vitest'
import { apiFor, fixedClock, FIXED_NOW } from '../../test/fixtures'
import {
  findField,
  getField,
  renderApp,
  screen,
  switchPersona,
  waitFor,
  within,
} from '../../test/renderApp'

const POOL_AT_START = 217_030
const card = (name: string) => screen.getByRole('heading', { name }).closest('.card') as HTMLElement

describe('spend over the household limit', () => {
  it('becomes a pending request, then a second person approves it and the balance changes', async () => {
    const { user, backend, householdId } = renderApp({ path: 'move?tab=spend' })

    await user.type(await findField('Amount'), '150')
    expect(await screen.findByText(/above the approval limit of \$100\.00/i)).toBeInTheDocument()
    await user.type(getField('What is it for?'), 'Big fridge')
    await user.click(screen.getByRole('button', { name: 'Send for approval' }))

    expect(await screen.findByText('Sent for approval')).toBeInTheDocument()
    expect(screen.getByText(/no balance has changed yet/i)).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POOL')).toBe(POOL_AT_START)

    // The requester can follow it, but cannot approve it herself.
    await user.click(screen.getByRole('link', { name: /track it in approvals/i }))
    await screen.findByRole('heading', { level: 1, name: 'Approvals' })
    const own = await screen.findByRole('heading', { name: 'Big fridge' })
    expect(own).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve Big fridge' })).toBeDisabled()
    expect(screen.getByText(/you cannot approve your own request/i)).toBeInTheDocument()
    expect(within(card('Big fridge')).getByText(/expires in 3 days/i)).toBeInTheDocument()

    // A different approver can.
    await switchPersona(user, 'Dev Okafor')
    const approve = await screen.findByRole('button', { name: 'Approve Big fridge' })
    expect(approve).toBeEnabled()
    await user.click(approve)

    expect(await screen.findByText('Approved and recorded')).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POOL')).toBe(POOL_AT_START - 15_000)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Approve Big fridge' })).not.toBeInTheDocument(),
    )

    await user.click(screen.getByRole('tab', { name: /history/i }))
    const done = card('Big fridge')
    expect(within(done).getByText('Approved')).toBeInTheDocument()
    expect(within(done).getByText(/approved by you/i)).toBeInTheDocument()
  })

  it('does not let you approve your own request: the button is disabled and says why', async () => {
    const { user, backend } = renderApp({
      uid: 'u-dev',
      path: 'move?tab=spend',
      prepare: () => undefined,
    })
    await user.type(await findField('Amount'), '120')
    await user.type(getField('What is it for?'), 'Sofa')
    await user.click(screen.getByRole('button', { name: 'Send for approval' }))
    await screen.findByText('Sent for approval')
    await user.click(screen.getByRole('link', { name: /track it in approvals/i }))

    const approve = await screen.findByRole('button', { name: 'Approve Sofa' })
    expect(approve).toBeDisabled()
    expect(screen.getByText(/another owner or approver has to/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject Sofa' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Withdraw Sofa' })).toBeEnabled()
    expect(backend.requests.filter((r) => r.path.endsWith('/approve'))).toHaveLength(0)
  })

  it('shows the server refusal if someone else decided first', async () => {
    const { user, householdId, backend } = renderApp({ uid: 'u-dev', path: 'approvals' })
    const approve = await screen.findByRole('button', { name: /approve winter coats/i })
    const pending = (
      await apiFor(backend, 'u-dev').listApprovals(householdId, 'PENDING_APPROVAL')
    )[0]!
    await apiFor(backend, 'u-maya').approve(householdId, pending.id, 'maya-first')
    await user.click(approve)
    expect(await screen.findByText(/someone already decided this request/i)).toBeInTheDocument()
  })

  it('approves once even when the button is double-clicked', async () => {
    const { user, backend, householdId } = renderApp({ uid: 'u-dev', path: 'approvals' })
    await user.dblClick(await screen.findByRole('button', { name: /approve winter coats/i }))
    expect(await screen.findByText('Approved and recorded')).toBeInTheDocument()
    expect(backend.requests.filter((r) => r.path.endsWith('/approve'))).toHaveLength(1)
    expect(backend.balanceOf(householdId, 'POOL')).toBe(POOL_AT_START - 18_000)
  })
})

describe('approvals inbox', () => {
  it('lets an approver reject with a note, and the requester sees the outcome', async () => {
    const { user } = renderApp({ uid: 'u-dev', path: 'approvals' })
    expect(await screen.findByRole('tab', { name: /needs a decision \(1\)/i })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /reject winter coats/i }))
    const dialog = await screen.findByRole('dialog', { name: /reject this request/i })
    await user.type(within(dialog).getByLabelText(/note/i), 'Wait for the sales')
    await user.click(within(dialog).getByRole('button', { name: 'Reject request' }))
    expect(await screen.findByText('Request rejected')).toBeInTheDocument()

    await switchPersona(user, 'Sam Okafor')
    await user.click(await screen.findByRole('tab', { name: /history/i }))
    const coats = card('Winter coats for the kids')
    expect(within(coats).getByText('Rejected')).toBeInTheDocument()
    expect(within(coats).getByText(/wait for the sales/i)).toBeInTheDocument()
  })

  it('shows a requester their status and expiry, and lets them withdraw after confirming', async () => {
    const { user, backend, householdId } = renderApp({ uid: 'u-sam', path: 'approvals' })
    const coats = await screen.findByRole('heading', { name: 'Winter coats for the kids' })
    const item = coats.closest('.card') as HTMLElement
    expect(within(item).getByText('Waiting for approval')).toBeInTheDocument()
    expect(within(item).getByText(/expires in 3 days/i)).toBeInTheDocument()
    expect(within(item).getByText(/only an owner or approver can decide/i)).toBeInTheDocument()
    expect(within(item).queryByRole('button', { name: /^approve/i })).not.toBeInTheDocument()

    await user.click(within(item).getByRole('button', { name: /withdraw winter coats/i }))
    const dialog = await screen.findByRole('dialog', { name: /withdraw this request/i })
    expect(within(dialog).getByText(/nothing will be recorded/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw request' }))
    expect(await screen.findByText('Request withdrawn')).toBeInTheDocument()
    const status = (await apiFor(backend, 'u-sam').listApprovals(householdId))[0]!
    expect(status.status).toBe('REJECTED')
  })

  it('reports an expired request as expired, with no way to decide it', async () => {
    const clock = fixedClock()
    renderApp({
      uid: 'u-dev',
      path: 'approvals',
      clock,
      prepare: () => {
        clock.current = new Date(FIXED_NOW.getTime() + 4 * 86_400_000)
      },
    })
    await screen.findByRole('tab', { name: /needs a decision \(0\)/i })
    expect(screen.getByText('Nothing waiting')).toBeInTheDocument()
  })

  it('has history, and an empty state with a next step when nothing waits', async () => {
    const { user } = renderApp({ uid: 'u-dev', path: 'approvals' })
    await user.click(await screen.findByRole('tab', { name: /history/i }))
    expect(card('Dentist visit')).toHaveTextContent('Approved')
    expect(card('Gaming laptop')).toHaveTextContent(/let us budget this for the holidays/i)
    expect(card('Gaming laptop')).toHaveTextContent('Rejected')
  })

  it('shows an error with retry when the requests cannot be loaded', async () => {
    const { user, backend } = renderApp({
      path: 'approvals',
      prepare: (b) => b.breakRoute(/\/approvals$/),
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(/we could not load the requests/i)
    backend.repair()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', { name: 'Winter coats for the kids' }),
    ).toBeInTheDocument()
  })
})
