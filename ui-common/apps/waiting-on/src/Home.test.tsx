import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { demoSeed } from './mock/seed'
import { NOW, problem, renderApp } from './testing/harness'

describe('home', () => {
  it('leads with a summary of what is waiting, then groups by urgency', async () => {
    renderApp()
    const summary = within(await screen.findByRole('region', { name: 'Summary' }))
    expect(summary.getByText('3 of 5 items are past their expected date.')).toBeInTheDocument()
    expect(summary.getByRole('group', { name: 'Open items' })).toHaveTextContent('5')
    expect(summary.getByRole('group', { name: 'Overdue' })).toHaveTextContent('3')
    const next = summary.getByRole('group', { name: 'Next follow-up' })
    expect(next).toHaveTextContent('Today')
    expect(within(next).getByRole('link', { name: 'Oak and Ash Furniture' })).toBeInTheDocument()

    await screen.findByRole('heading', { name: /Recently closed/ })
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Overdue 3', 'Due soon 1', 'Later 1', 'Recently closed 3'])
    expect(
      screen.getAllByRole('link', { name: 'Add something you are waiting for' })[0],
    ).toHaveAttribute('href', '/new')
  })

  it('shows a rising gauge for how far a follow-up has climbed', async () => {
    renderApp()
    const claim = (await screen.findByRole('link', { name: 'Water damage claim #88213' })).closest(
      'li',
    )!
    expect(
      within(claim).getByRole('img', { name: '2 of 3 follow-up letters reached' }),
    ).toBeInTheDocument()
    const desk = screen.getByRole('link', { name: 'Standing desk order #5521' }).closest('li')!
    expect(
      within(desk).getByRole('img', { name: '0 of 3 follow-up letters reached' }),
    ).toBeInTheDocument()
  })

  it('never shows a next step dated in the past: an overdue step reads "due now"', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /Recently closed/ })
    const lines = [...document.querySelectorAll('.wo-card-next')].filter((p) =>
      p.textContent?.startsWith('Next:'),
    )
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      const time = line.querySelector('time')
      if (time) expect(new Date(time.dateTime).getTime()).toBeGreaterThan(NOW.getTime())
      else expect(line).toHaveTextContent(/due now$/)
    }
  })

  it('shows the all-clear state when nothing is open but earlier items exist', async () => {
    const closedOnly = demoSeed(NOW).filter((e) =>
      ['RESOLVED', 'EXPIRED', 'CANCELLED'].includes(e.item.status),
    )
    renderApp({ seed: closedOnly })
    expect(
      await screen.findByRole('heading', { name: 'You are not waiting on anyone' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Summary' })).not.toBeInTheDocument()
  })

  it('shows first-run guidance when the user has never added anything', async () => {
    renderApp({ seed: [] })
    expect(
      await screen.findByRole('heading', { name: /Tell Waiting On what you are waiting for/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Summary' })).not.toBeInTheDocument()
  })

  it('shows a readable error with a retry, and no summary', async () => {
    renderApp({ intercept: () => problem(503, 'Service Unavailable', 'The service is down.') })
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your items')
    expect(screen.queryByRole('region', { name: 'Summary' })).not.toBeInTheDocument()
  })

  it('opens the full list from the recently closed section', async () => {
    const { user } = renderApp()
    await user.click(
      await screen.findByRole('button', { name: 'Show every item, closed ones too' }),
    )
    expect(await screen.findByText('8 items shown')).toBeInTheDocument()
  })
})
