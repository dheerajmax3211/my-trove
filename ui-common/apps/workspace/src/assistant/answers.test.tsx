import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Answer } from './answers'
import { APPLIANCES, FOLLOW_UPS, ONE_HOUSEHOLD, SEARCH, TWO_HOUSEHOLDS } from './fixtures'
import type { ToolName } from './intent'

function show(tool: ToolName, data: unknown, question = 'q') {
  const onNavigate = vi.fn()
  const onChooseHousehold = vi.fn()
  render(
    <MemoryRouter>
      <Answer
        tool={tool}
        data={data}
        question={question}
        onNavigate={onNavigate}
        onChooseHousehold={onChooseHousehold}
      />
    </MemoryRouter>,
  )
  return { onNavigate, onChooseHousehold }
}

const href = (name: string | RegExp) => screen.getByRole('link', { name }).getAttribute('href')

describe('Waiting On answers', () => {
  it('lists each open item with its status, amount and next step, linked to the item', () => {
    show('waiting_on_list_followups', FOLLOW_UPS)
    expect(screen.getByText("You're waiting on 2 things.")).toBeInTheDocument()
    expect(href('Refund for returned jacket')).toBe('/app/waiting-on/items/item-1')
    expect(href('Insurance claim payout')).toBe('/app/waiting-on/items/item-2')
    expect(
      screen.getByText(/Northwind Outfitters · Nudged · expected .* · \$129\.99/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Next: an escalation on/)).toBeInTheDocument()
    expect(href('Open Waiting On')).toBe('/app/waiting-on')
  })

  it('says so when nothing is open', () => {
    show('waiting_on_list_followups', { items: [], count: 0 })
    expect(screen.getByText("You aren't waiting on anything right now.")).toBeInTheDocument()
  })

  it('links follow the panel closing', async () => {
    const { onNavigate } = show('waiting_on_list_followups', FOLLOW_UPS)
    await userEvent.click(screen.getByRole('link', { name: 'Open Waiting On' }))
    expect(onNavigate).toHaveBeenCalled()
  })
})

describe('Ask Your Life answers', () => {
  it('shows the best passage as a quote citing its document, and links to the full search', () => {
    show('ask_your_life_search', SEARCH)
    const quote = screen.getByRole('blockquote')
    expect(quote).toHaveTextContent('Passport expires in August 2027')
    expect(screen.getByText('Passport renewal', { selector: 'cite' })).toBeInTheDocument()
    expect(screen.getByText('Also mentioned in: Dentist')).toBeInTheDocument()
    expect(href('See every result in Ask Your Life')).toBe(
      '/app/ask-your-life?q=When%20does%20my%20passport%20expire%3F',
    )
  })

  it('says nothing matched, with a way to add something', () => {
    show('ask_your_life_search', { query: 'zebra', passages: [], count: 0 })
    expect(
      screen.getByText(/Nothing in your notes, documents or receipts matches that/),
    ).toBeInTheDocument()
    expect(href('Add something to Ask Your Life')).toBe('/app/ask-your-life/add')
  })
})

describe('Home Pulse answers', () => {
  it('summarises what needs attention and lists each appliance with health and open alerts', () => {
    show('home_pulse_appliance_status', APPLIANCES)
    expect(screen.getByText('1 of 2 appliances needs attention.')).toBeInTheDocument()
    expect(href('Kitchen fridge')).toBe('/app/home-pulse/appliances/app-1')
    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText(/running non-stop for 6.3 h/)).toBeInTheDocument()
    expect(href('Open alerts in Home Pulse')).toBe('/app/home-pulse/alerts')
  })

  it('says when everything is fine, and when there are no appliances', () => {
    show('home_pulse_appliance_status', {
      appliances: [{ ...APPLIANCES.appliances[1] }],
      count: 1,
      truncated: false,
    })
    expect(screen.getByText('Your appliance looks fine.')).toBeInTheDocument()
  })

  it('offers to add one when there are none', () => {
    show('home_pulse_appliance_status', { appliances: [], count: 0, truncated: false })
    expect(screen.getByText(/haven't added any appliances/)).toBeInTheDocument()
    expect(href('Add an appliance')).toBe('/app/home-pulse/appliances/new')
  })
})

describe('Family Treasury answers', () => {
  it('shows every account balance of the only household, linked to it', () => {
    show('family_treasury_ledger_summary', ONE_HOUSEHOLD)
    expect(href('The Rao family')).toBe('/app/family-treasury/h/hh-1')
    const pool = screen.getByText('Household pool').closest('div')
    expect(pool).not.toBeNull()
    expect(within(pool as HTMLElement).getByText('$200.00')).toBeInTheDocument()
    expect(screen.getByText(/no real money moves/)).toBeInTheDocument()
  })

  it('asks which household when there is more than one', async () => {
    const { onChooseHousehold } = show('family_treasury_ledger_summary', TWO_HOUSEHOLDS)
    expect(screen.getByText('You belong to 2 households. Which one?')).toBeInTheDocument()
    expect(screen.queryByText('Household pool')).not.toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Choose a household' })
    await userEvent.click(within(group).getByRole('button', { name: 'Lake house' }))
    expect(onChooseHousehold).toHaveBeenCalledWith({ id: 'hh-2', name: 'Lake house' })
  })

  it('does not ask when the question names the household', () => {
    show('family_treasury_ledger_summary', TWO_HOUSEHOLDS, 'money in the lake house?')
    expect(href('Lake house')).toBe('/app/family-treasury/h/hh-2')
    expect(screen.getByText('$120.50')).toBeInTheDocument()
  })

  it('says so when the person belongs to no household', () => {
    show('family_treasury_ledger_summary', { households: [], count: 0, truncated: false })
    expect(screen.getByText(/don't belong to a household/)).toBeInTheDocument()
  })
})

describe('an answer in a shape the assistant cannot read', () => {
  it.each<ToolName>([
    'waiting_on_list_followups',
    'ask_your_life_search',
    'home_pulse_appliance_status',
    'family_treasury_ledger_summary',
  ])('%s says so instead of breaking', (tool) => {
    show(tool, { surprise: true })
    expect(screen.getByRole('alert')).toHaveTextContent(
      "answered in a way the assistant can't read",
    )
  })

  it('skips malformed rows and keeps the good ones', () => {
    show('waiting_on_list_followups', { items: [null, 7, { id: 'x' }, FOLLOW_UPS.items[0]] })
    expect(screen.getByText("You're waiting on 1 thing.")).toBeInTheDocument()
  })
})
