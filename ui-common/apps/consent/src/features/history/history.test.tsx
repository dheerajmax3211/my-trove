import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockBackend } from '../../mock/backend'
import { callsTo, pageHeading, renderApp } from '../../test/utils'

async function openHistory(options: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp({ route: '/history', ...options })
  await pageHeading('Access history')
  return app
}

const bodyRows = async () => {
  const table = await screen.findByRole('table', { name: 'Access history' })
  return within(table).getAllByRole('row').slice(1)
}

describe('access history', () => {
  it('lists the newest entries first, with readable events and details', async () => {
    await openHistory()
    // the table shows placeholder rows while the first page loads
    await waitFor(async () => expect(await bodyRows()).toHaveLength(20))
    const rows = await bodyRows()
    expect(within(rows[0] as HTMLElement).getByText('21')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Access history' })
    expect(within(table).getAllByText('Data read').length).toBe(3)
    expect(
      within(table).getAllByText(
        'Read profile.sizes.shoe, profile.sizes.shirt, profile.sizes.jacket',
      ).length,
    ).toBe(3)
  })

  it('pages backwards with older and newer, using the previous page as the cursor', async () => {
    const { user, backend } = await openHistory()
    await bodyRows()
    expect(screen.getByRole('button', { name: 'Newer' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Older' }))
    await screen.findByText('Page 2')
    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(within(rows[1] as HTMLElement).getByText('Attribute added')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Older' })).toBeDisabled()
    expect(callsTo(backend, 'GET', '/access-log').at(-1)?.query).toMatchObject({
      limit: '21',
      beforeSeq: '2',
    })

    await user.click(screen.getByRole('button', { name: 'Newer' }))
    expect(await screen.findByText('Page 1')).toBeInTheDocument()
  })

  it('filters by client and starts again from the first page', async () => {
    const { user, backend } = await openHistory()
    await bodyRows()
    await user.click(screen.getByRole('button', { name: 'Older' }))
    await screen.findByText('Page 2')
    await user.selectOptions(screen.getByLabelText('Show activity for'), 'Meal Planner')
    await screen.findByText('Page 1')
    const rows = await bodyRows()
    expect(rows).toHaveLength(2) // registered + access requested
    expect(callsTo(backend, 'GET', '/access-log').at(-1)?.query.clientId).toMatch(/^cl_/)
    expect(callsTo(backend, 'GET', '/access-log').at(-1)?.query.beforeSeq).toBeUndefined()
  })

  it('shows an empty state for an app with no activity', async () => {
    await openHistory({ seed: 'empty' })
    expect(await screen.findByRole('heading', { name: 'No activity yet' })).toBeInTheDocument()
  })

  it('shows an error with retry when the log cannot load', async () => {
    const backend = createMockBackend()
    backend.failNext(/GET \/v1\/owner\/access-log/, 500, 'boom')
    const { user } = await openHistory({ backend })
    expect(await screen.findByRole('alert')).toHaveTextContent('The gateway had a problem')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await bodyRows()).toHaveLength(20)
  })
})
