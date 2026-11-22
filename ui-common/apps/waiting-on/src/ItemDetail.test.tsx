import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OTHER_USERS_ITEM_ID } from './mock/seed'
import { problem, renderApp } from './testing/harness'

const JACKET = '00000000-0000-4000-8000-000000000001' // nudged refund
const CLAIM = '00000000-0000-4000-8000-000000000002' // escalated claim, snoozed 7 days
const EXPENSES = '00000000-0000-4000-8000-000000000003' // open reimbursement
const PERMIT = '00000000-0000-4000-8000-000000000005' // resolved approval

const open = (id: string) => `/items/${id}`
const actionButtons = () => ({
  resolve: screen.getByRole('button', { name: 'Resolve' }),
  snooze: screen.getByRole('button', { name: 'Snooze' }),
  cancel: screen.getByRole('button', { name: 'Cancel tracking' }),
})

describe('item page', () => {
  it('opens from the list and shows the item, its status and the page heading', async () => {
    const { user } = renderApp()
    await user.click(await screen.findByRole('link', { name: 'Refund for returned jacket' }))
    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Refund for returned jacket',
    })
    expect(heading).toHaveFocus()
    expect(screen.getByText('Waiting on Northwind Outfitters')).toBeInTheDocument()
    const details = within(await screen.findByRole('region', { name: 'Details' }))
    expect(details.getByText('support@northwind.example', { exact: false })).toBeInTheDocument()
    expect(details.getByText('Overdue by 8 days')).toBeInTheDocument()
    expect(document.title).toBe('Refund for returned jacket | Waiting On')
  })

  it('renders the timeline as a list, newest first, with letters collapsed', async () => {
    renderApp({ route: open(CLAIM) })
    const timeline = within(await screen.findByRole('list', { name: 'Timeline, newest first' }))
    const entries = timeline.getAllByRole('listitem')
    expect(entries.map((e) => within(e).getAllByText(/./)[0]?.textContent)).toEqual([
      'Escalation letter drafted',
      'Reply received',
      'Snoozed',
      'Friendly nudge',
      'Tracking started',
    ])
    expect(within(entries[0]!).getByText('Show the full text')).toBeInTheDocument()
    expect(
      within(entries[1]!).getByText('We need the repair invoice before we can proceed.'),
    ).toBeInTheDocument()
  })

  it('shows the live follow-up stage and when the next step is scheduled', async () => {
    renderApp({ route: open(CLAIM) })
    const card = within(await screen.findByRole('region', { name: 'Follow-up status' }))
    expect(await card.findByText('Escalated, waiting for a reply')).toBeInTheDocument()
    expect(card.getByText('Final notice')).toBeInTheDocument()
    expect(card.getByText('(in 2 days)')).toBeInTheDocument()
    expect(card.getByText('7 days in total')).toBeInTheDocument()
  })

  it('lets the owner paste a reply and says how it was read', async () => {
    const { user } = renderApp({ route: open(JACKET) })
    const card = within(await screen.findByRole('region', { name: 'Their reply' }))
    expect(screen.queryByText(/Not connected yet/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy reply address' })).not.toBeInTheDocument()
    expect(screen.queryByText(/@reply\.waiting-on\.local/)).not.toBeInTheDocument()

    await user.click(card.getByRole('button', { name: 'Record reply' }))
    expect(card.getByRole('alert')).toHaveTextContent('Paste what they said first.')

    await user.type(card.getByLabelText(/What did they say/), 'Your refund has been processed.')
    await user.click(card.getByRole('button', { name: 'Record reply' }))
    expect(await card.findByTestId('reply-outcome')).toHaveTextContent('Read as paid or approved')
  })
})

describe('draft letters', () => {
  it('previews each stage and copies the letter', async () => {
    const { user, requests } = renderApp({ route: open(JACKET) })
    const subject = async () => (await screen.findByTestId('letter-subject')).textContent
    const body = () => screen.getByTestId('letter-body').textContent ?? ''

    expect(await subject()).toBe('Following up: Refund for returned jacket')
    expect(body()).toContain('Hello Northwind Outfitters,')
    expect(body()).toContain('8 days past that date')
    expect(body()).not.toContain('day(s)')

    await user.click(screen.getByRole('tab', { name: 'Formal escalation' }))
    await waitFor(async () =>
      expect(await subject()).toBe('Formal complaint: Refund for returned jacket'),
    )
    expect(body()).toContain('FORMAL COMPLAINT AND REQUEST FOR ACTION')
    expect(body()).toContain('within 14 days')

    await user.click(screen.getByRole('button', { name: 'Copy letter' }))
    const copied = await navigator.clipboard.readText()
    expect(
      copied.startsWith(
        'Subject: Formal complaint: Refund for returned jacket\n\nFORMAL COMPLAINT',
      ),
    ).toBe(true)

    await user.click(screen.getByRole('tab', { name: 'Final notice' }))
    await waitFor(async () =>
      expect(await subject()).toBe('FINAL NOTICE: Refund for returned jacket'),
    )
    expect(body()).toContain('within 7 days')
    expect(screen.getByText(/not legal advice/)).toBeInTheDocument()

    expect(requests.filter((r) => r.path.endsWith('/draft')).map((r) => r.search)).toEqual([
      '?tone=NUDGE',
      '?tone=ESCALATION',
      '?tone=FINAL_NOTICE',
    ])
  })

  it('reports a draft failure inside the panel and retries', async () => {
    let fail = true
    const { user } = renderApp({
      route: open(JACKET),
      intercept: (r) =>
        r.path.endsWith('/draft') && fail
          ? problem(500, 'Internal Server Error', 'boom')
          : undefined,
    })
    expect(await screen.findByText('We could not draft this letter')).toBeInTheDocument()
    fail = false
    await user.click(
      within(screen.getByText('We could not draft this letter').closest('div')!).getByRole(
        'button',
        { name: 'Try again' },
      ),
    )
    expect(await screen.findByTestId('letter-subject')).toBeInTheDocument()
  })
})

describe('snooze', () => {
  it('moves the next action later and records it on the timeline', async () => {
    const { user, requests } = renderApp({ route: open(EXPENSES) })
    const status = within(await screen.findByRole('region', { name: 'Follow-up status' }))
    expect(await status.findByText('(in 10 days)')).toBeInTheDocument()

    await user.click(actionButtons().snooze)
    const dlg = within(await screen.findByRole('dialog', { name: 'Snooze follow-ups' }))
    await user.click(dlg.getByRole('button', { name: '14 days' }))
    await user.click(dlg.getByRole('button', { name: 'Snooze' }))

    expect(await status.findByText('(in 24 days)')).toBeInTheDocument()
    expect(status.getByText('14 days in total')).toBeInTheDocument()
    expect(requests.find((r) => r.path.endsWith('/snooze'))?.body).toEqual({ days: 14 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Follow-ups postponed by 14 days')).toBeInTheDocument()
    expect(await screen.findByText('Snoozed for 14 days')).toBeInTheDocument()
  })

  it('rejects a number of days outside 1 to 90 without calling the service', async () => {
    const { user, requests } = renderApp({ route: open(EXPENSES) })
    await user.click(await screen.findByRole('button', { name: 'Snooze' }))
    const dlg = within(await screen.findByRole('dialog'))
    const days = dlg.getByLabelText(/Snooze for how many days/)
    await user.clear(days)
    await user.type(days, '120')
    await user.click(dlg.getByRole('button', { name: 'Snooze' }))
    expect(await dlg.findByText('Enter a whole number of days from 1 to 90.')).toBeInTheDocument()
    expect(requests.filter((r) => r.path.endsWith('/snooze'))).toHaveLength(0)
  })
})

describe('resolve', () => {
  it('closes the item with an outcome and switches every action off', async () => {
    const { user, requests } = renderApp({ route: open(JACKET) })
    await user.click(await screen.findByRole('button', { name: 'Resolve' }))
    const dlg = within(await screen.findByRole('dialog', { name: 'Mark as resolved' }))
    await user.type(dlg.getByLabelText(/How did it end/), 'Refunded to my card')
    await user.click(dlg.getByRole('button', { name: 'Mark as resolved' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(requests.find((r) => r.path.endsWith('/resolve'))?.body).toEqual({
      outcome: 'Refunded to my card',
    })
    await waitFor(() => expect(actionButtons().resolve).toBeDisabled())
    expect(actionButtons().snooze).toBeDisabled()
    expect(actionButtons().cancel).toBeDisabled()
    expect(
      screen.getByText('This item is resolved, so there is nothing left to do.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Refunded to my card', { selector: 'dd' })).toBeInTheDocument()
    expect(
      screen.getByText(/Follow-ups have stopped and nothing more is scheduled/),
    ).toBeInTheDocument()
    expect(await screen.findByText('Marked as resolved', { selector: 'p' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Back to waiting list' }))
    const waiting = within(await screen.findByRole('group', { name: 'Waiting items' }))
    expect(
      waiting.queryByRole('link', { name: 'Refund for returned jacket' }),
    ).not.toBeInTheDocument()
    // it moved to the short list of recently closed items
    const recent = within(await screen.findByRole('region', { name: /Recently closed/ }))
    expect(recent.getByRole('link', { name: 'Refund for returned jacket' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Status'), 'RESOLVED')
    expect(
      await screen.findByRole('link', { name: 'Refund for returned jacket' }),
    ).toBeInTheDocument()
  })

  it('has no actions to take on an item that was already closed', async () => {
    renderApp({ route: open(PERMIT) })
    await screen.findByRole('heading', { level: 1, name: 'Parking permit renewal' })
    expect(actionButtons().resolve).toBeDisabled()
    expect(actionButtons().snooze).toBeDisabled()
    expect(actionButtons().cancel).toBeDisabled()
    expect(
      screen.getByText(/Approved. The permit arrives by post this week./, { selector: 'dd' }),
    ).toBeInTheDocument()
  })

  it('explains a conflict when the item was closed somewhere else', async () => {
    const { user } = renderApp({
      route: open(JACKET),
      intercept: (r) =>
        r.path.endsWith('/resolve')
          ? problem(409, 'Conflict', 'Item is already RESOLVED')
          : undefined,
    })
    await user.click(await screen.findByRole('button', { name: 'Resolve' }))
    const dlg = within(await screen.findByRole('dialog'))
    await user.click(dlg.getByRole('button', { name: 'Mark as resolved' }))
    expect(await dlg.findByRole('alert')).toHaveTextContent(
      'This item is already resolved, so nothing was changed.',
    )
  })
})

describe('cancel', () => {
  it('asks for confirmation, can be backed out of, and then stops tracking', async () => {
    const { user, requests } = renderApp({ route: open(JACKET) })
    await user.click(await screen.findByRole('button', { name: 'Cancel tracking' }))
    const dlg = within(await screen.findByRole('dialog', { name: 'Stop tracking this item?' }))
    expect(dlg.getByText(/cannot be undone/)).toBeInTheDocument()
    await user.click(dlg.getByRole('button', { name: 'Keep tracking' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(requests.filter((r) => r.path.endsWith('/cancel'))).toHaveLength(0)
    expect(screen.getAllByText('Nudged').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Cancel tracking' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Yes, stop tracking' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(requests.filter((r) => r.path.endsWith('/cancel'))).toHaveLength(1)
    await waitFor(() => expect(actionButtons().cancel).toBeDisabled())
    expect(
      screen.getByText('This item is cancelled, so there is nothing left to do.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('Tracking cancelled', { selector: 'p' })).toBeInTheDocument()
  })
})

describe('failures', () => {
  it("shows a not-found page for another user's item and for one that does not exist", async () => {
    const first = renderApp({ route: open(OTHER_USERS_ITEM_ID) })
    expect(await screen.findByText('We could not find that item')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Item not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your waiting list' })).toBeInTheDocument()
    expect(screen.queryByText("Somebody else's refund")).not.toBeInTheDocument()
    first.unmount()

    renderApp({ route: open('00000000-0000-4000-8000-000000009999') })
    expect(await screen.findByText('We could not find that item')).toBeInTheDocument()
  })

  it('shows a 404 page for an unknown address', async () => {
    renderApp({ route: '/nowhere' })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument()
  })

  it('reports a failing list and recovers with Try again', async () => {
    let broken = true
    const { user } = renderApp({
      intercept: (r) =>
        r.path === '/api/v1/items' && broken
          ? problem(500, 'Internal Server Error', 'java.lang.NullPointerException')
          : undefined,
    })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('We could not load your items')
    expect(alert).toHaveTextContent('Something went wrong on our side')
    expect(alert).not.toHaveTextContent('NullPointerException')
    broken = false
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('group', { name: 'Waiting items' })).toBeInTheDocument()
  })

  it('says so when the server cannot be reached', async () => {
    renderApp({
      intercept: () => Promise.reject(new TypeError('Failed to fetch')),
    })
    expect(await screen.findByText(/could not reach the server/)).toBeInTheDocument()
  })

  it('returns to sign-in when the session is rejected', async () => {
    renderApp({
      intercept: () => problem(401, 'Unauthorized', 'A valid Firebase ID token is required.'),
    })
    expect(
      await screen.findByRole('heading', { name: 'Sign in to Waiting On' }),
    ).toBeInTheDocument()
  })

  it('degrades gracefully when the live follow-up state cannot be read', async () => {
    const { user } = renderApp({
      route: open(JACKET),
      intercept: async (r, passThrough) => {
        if (r.path !== `/api/v1/items/${JACKET}`) return undefined
        const item = (await (await passThrough()).json()) as object
        return Response.json({ ...item, followUp: null })
      },
    })
    expect(await screen.findByText(/live follow-up status is unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Timeline, newest first' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Resolve' }))
    expect(await screen.findByRole('dialog', { name: 'Mark as resolved' })).toBeInTheDocument()
  })
})

describe('shell', () => {
  it('signs out to the sign-in screen', async () => {
    const { user } = renderApp()
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(
      await screen.findByRole('heading', { name: 'Sign in to Waiting On' }),
    ).toBeInTheDocument()
  })

  it('moves focus to the new page heading after navigating', async () => {
    const { user } = renderApp()
    await screen.findByRole('group', { name: 'Waiting items' })
    await user.click(screen.getAllByRole('link', { name: 'Add something you are waiting for' })[0]!)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Add something you are waiting for' }),
    ).toHaveFocus()
  })
})
