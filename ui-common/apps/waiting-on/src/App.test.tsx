import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { problem, renderApp, type RecordedRequest } from './testing/harness'

const list = async () => within(await screen.findByRole('list', { name: 'Waiting items' }))
const titles = async () =>
  (await list()).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('first use', () => {
  it('explains the product and leads to the form when there are no items at all', async () => {
    const { user } = renderApp({ seed: [] })
    expect(await screen.findByRole('heading', { name: /Stop chasing people/ })).toBeInTheDocument()
    expect(screen.getByText(/a friendly nudge, then a firm escalation letter/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Filters' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Add your first item' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Add something you are waiting for' }),
    ).toBeInTheDocument()
  })
})

describe('waiting list', () => {
  it('shows active items by default, with status, overdue and next-action indicators', async () => {
    renderApp()
    expect(await titles()).toEqual([
      'Water damage claim #88213',
      'Refund for returned jacket',
      'Standing desk order #5521',
      'Conference travel expenses',
    ])
    const jacket = within(
      (await list())
        .getByRole('link', { name: 'Refund for returned jacket' })
        .closest('li') as HTMLElement,
    )
    expect(jacket.getByText('Nudged')).toBeInTheDocument()
    expect(jacket.getByText('Overdue by 8 days')).toBeInTheDocument()
    expect(jacket.getByText(/formal escalation letter/i)).toBeInTheDocument()
    expect(jacket.getByText(/Waiting on Northwind Outfitters/)).toBeInTheDocument()
    const expenses = within(
      (await list())
        .getByRole('link', { name: 'Conference travel expenses' })
        .closest('li') as HTMLElement,
    )
    expect(expenses.getByText('Due in 5 days')).toBeInTheDocument()
    expect(screen.getByText('4 items, 3 overdue')).toBeInTheDocument()
  })

  it("never shows another user's items", async () => {
    const { user } = renderApp()
    await user.selectOptions(await screen.findByLabelText('Status'), 'ALL')
    await waitFor(async () => expect(await titles()).toHaveLength(7))
    expect(await titles()).not.toContain("Somebody else's refund")
  })

  it('filters by status through the service and keeps the choice in the address', async () => {
    const { user, requests } = renderApp()
    await screen.findByRole('list', { name: 'Waiting items' })
    await user.selectOptions(screen.getByLabelText('Status'), 'RESOLVED')
    await waitFor(async () => expect(await titles()).toEqual(['Parking permit renewal']))
    const closed = within(
      (await list())
        .getByRole('link', { name: 'Parking permit renewal' })
        .closest('li') as HTMLElement,
    )
    expect(closed.getByText('Resolved')).toBeInTheDocument()
    expect(closed.getByText(/Approved. The permit arrives by post/)).toBeInTheDocument()
    expect(closed.queryByText(/Overdue/)).not.toBeInTheDocument()
    expect(requests.at(-1)?.search).toBe('?limit=100&status=RESOLVED')

    await user.selectOptions(screen.getByLabelText('Status'), 'EXPIRED')
    await waitFor(async () => expect(await titles()).toEqual(['Deposit return from old flat']))
    await user.selectOptions(screen.getByLabelText('Status'), 'CANCELLED')
    await waitFor(async () =>
      expect(await titles()).toEqual(['Warranty replacement for headphones']),
    )
  })

  it('filters by category on top of the status filter', async () => {
    const { user } = renderApp()
    await screen.findByRole('list', { name: 'Waiting items' })
    await user.selectOptions(screen.getByLabelText('Category'), 'DELIVERY')
    await waitFor(async () => expect(await titles()).toEqual(['Standing desk order #5521']))
    await user.selectOptions(screen.getByLabelText('Status'), 'RESOLVED')
    expect(await screen.findByText('Nothing matches these filters')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show everything' }))
    await waitFor(async () => expect(await titles()).toHaveLength(7))
  })

  it('shows a friendly message when filters match nothing', async () => {
    renderApp({ route: '/?status=EXPIRED&category=REFUND' })
    expect(await screen.findByText('Nothing matches these filters')).toBeInTheDocument()
  })
})

describe('adding an item', () => {
  it('validates on the client, focuses the first problem and sends nothing', async () => {
    const { user, requests } = renderApp({ route: '/new', seed: [] })
    await user.click(await screen.findByRole('button', { name: 'Start tracking' }))
    expect(await screen.findByText('Say what you are waiting for.')).toBeInTheDocument()
    expect(screen.getByText('Say who you are waiting on.')).toBeInTheDocument()
    expect(screen.getByText('Choose the closest category.')).toBeInTheDocument()
    expect(screen.getByText('Choose the date you expected this by.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText(/What are you waiting for/)).toHaveFocus())
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  })

  it('explains the follow-up schedule it will create and updates with the category and date', async () => {
    const { user } = renderApp({ route: '/new', seed: [] })
    expect(
      await screen.findByText(/Choose a category and the date you expected this by/),
    ).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/Category/), 'REFUND')
    fireEvent.change(screen.getByLabelText(/Expected by/), { target: { value: '2026-11-26' } })
    const schedule = within(await screen.findByRole('list', { name: 'Follow-up schedule' }))
    // expected in 7 days: refund defaults are 3, 10, 21 and 45 days after that date
    expect(schedule.getByText('Day 10')).toBeInTheDocument()
    expect(schedule.getByText('Day 17')).toBeInTheDocument()
    expect(schedule.getByText('Day 28')).toBeInTheDocument()
    expect(schedule.getByText('Day 52')).toBeInTheDocument()
    expect(schedule.getByText(/Formal escalation letter\./)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/Category/), 'OTHER')
    const other = within(await screen.findByRole('list', { name: 'Follow-up schedule' }))
    expect(other.queryByText(/Final notice\./)).not.toBeInTheDocument()
    expect(other.getAllByRole('listitem')).toHaveLength(3)
  })

  it('creates the item, lands on its page and lists it', async () => {
    const { user, requests } = renderApp({ route: '/new' })
    await user.type(
      await screen.findByLabelText(/What are you waiting for/),
      'Laptop repair refund',
    )
    await user.type(screen.getByLabelText(/Who are you waiting on/), 'FixIt Ltd')
    await user.selectOptions(screen.getByLabelText(/Category/), 'REFUND')
    await user.type(screen.getByLabelText('Amount'), '85.50')
    await user.selectOptions(screen.getByLabelText('Currency'), 'GBP')
    fireEvent.change(screen.getByLabelText(/Expected by/), { target: { value: '2026-11-26' } })
    await user.click(screen.getByRole('button', { name: 'Start tracking' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Laptop repair refund' }),
    ).toBeInTheDocument()
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      title: 'Laptop repair refund',
      counterparty: 'FixIt Ltd',
      category: 'REFUND',
      amount: 85.5,
      currency: 'GBP',
      expectedBy: '2026-11-26',
    })
    expect(screen.getByText('Waiting on FixIt Ltd')).toBeInTheDocument()
    expect(
      await screen.findByText(/waiting\+[a-f0-9]{20}@reply\.waiting-on\.local/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Back to waiting list' }))
    await waitFor(async () => expect(await titles()).toContain('Laptop repair refund'))
    const row = within(
      (await list())
        .getByRole('link', { name: 'Laptop repair refund' })
        .closest('li') as HTMLElement,
    )
    expect(row.getByText('Open')).toBeInTheDocument()
  })

  it('shows server field errors next to the field and keeps what was typed', async () => {
    const { user } = renderApp({
      route: '/new',
      intercept: (r: RecordedRequest) =>
        r.method === 'POST'
          ? problem(400, 'Bad Request', 'Invalid request content.', {
              errors: { title: ['You already track an item with this title.'] },
            })
          : undefined,
    })
    await user.type(await screen.findByLabelText(/What are you waiting for/), 'Jacket')
    await user.type(screen.getByLabelText(/Who are you waiting on/), 'Shop')
    await user.selectOptions(screen.getByLabelText(/Category/), 'OTHER')
    fireEvent.change(screen.getByLabelText(/Expected by/), { target: { value: '2026-11-26' } })
    await user.click(screen.getByRole('button', { name: 'Start tracking' }))
    expect(
      await screen.findByText('You already track an item with this title.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/What are you waiting for/)).toHaveValue('Jacket')
  })

  it('shows a readable message when the service refuses the request', async () => {
    const { user } = renderApp({
      route: '/new',
      intercept: (r) =>
        r.method === 'POST'
          ? problem(
              503,
              'Service Unavailable',
              'The follow-up scheduler is temporarily unavailable; nothing was changed. Please retry.',
            )
          : undefined,
    })
    await user.type(await screen.findByLabelText(/What are you waiting for/), 'Jacket')
    await user.type(screen.getByLabelText(/Who are you waiting on/), 'Shop')
    await user.selectOptions(screen.getByLabelText(/Category/), 'OTHER')
    fireEvent.change(screen.getByLabelText(/Expected by/), { target: { value: '2026-11-26' } })
    await user.click(screen.getByRole('button', { name: 'Start tracking' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /scheduler is temporarily unavailable/,
    )
  })

  it('lets you customise the schedule and checks the day order', async () => {
    const { user, requests } = renderApp({ route: '/new', seed: [] })
    await user.type(await screen.findByLabelText(/What are you waiting for/), 'Visa decision')
    await user.type(screen.getByLabelText(/Who are you waiting on/), 'Embassy')
    await user.selectOptions(screen.getByLabelText(/Category/), 'APPROVAL')
    fireEvent.change(screen.getByLabelText(/Expected by/), { target: { value: '2026-11-26' } })
    await user.click(screen.getByRole('switch', { name: /Customise the follow-up schedule/ }))
    const escalate = screen.getByLabelText('Escalate on day')
    expect(screen.getByLabelText('Nudge on day')).toHaveValue(10) // 7 days away + 3
    await user.clear(escalate)
    await user.type(escalate, '10')
    await user.click(screen.getByRole('button', { name: 'Start tracking' }))
    expect(await screen.findByText('Must come after the nudge.')).toBeInTheDocument()
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0)

    await user.clear(escalate)
    await user.type(escalate, '12')
    await user.click(screen.getByRole('button', { name: 'Start tracking' }))
    await screen.findByRole('heading', { level: 1, name: 'Visa decision' })
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      plan: {
        nudgeAfterDays: 10,
        escalateAfterDays: 12,
        finalNoticeAfterDays: 21,
        expireAfterDays: 37,
      },
    })
  })
})
