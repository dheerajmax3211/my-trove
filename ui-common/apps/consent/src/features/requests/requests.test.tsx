import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockBackend } from '../../mock/backend'
import { paths } from '../../shared/api/paths'
import { callsTo, dialog, pageHeading, renderApp } from '../../test/utils'

async function openInbox(options: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp({ route: '/requests', ...options })
  await pageHeading('Requests')
  return app
}

const card = (name: string) => screen.findByRole('group', { name })

describe('requests inbox', () => {
  it('lists pending requests with client, purpose, scopes and duration', async () => {
    await openInbox()
    const stride = await card('Stride Shoes')
    expect(within(stride).getByText('Recommend shoes and jackets that fit')).toBeInTheDocument()
    expect(within(stride).getByText('profile.sizes:read')).toBeInTheDocument()
    expect(within(stride).getByText('7 days')).toBeInTheDocument()
    expect(within(stride).getByText('Up to 20')).toBeInTheDocument()
    const meals = await card('Meal Planner')
    expect(within(meals).getByText('No limit')).toBeInTheDocument()
    expect(within(meals).getByText('30 days')).toBeInTheDocument()
  })

  it('shows an empty state when nothing is waiting', async () => {
    await openInbox({ seed: 'empty' })
    expect(await screen.findByRole('heading', { name: 'No requests waiting' })).toBeInTheDocument()
  })

  it('shows what the app will be able to read before approving', async () => {
    const { user } = await openInbox()
    await user.click(await screen.findByRole('button', { name: 'Review and approve Stride Shoes' }))
    const form = dialog()
    const summary = form.getByRole('region', { name: 'What this app will see' })
    expect(within(summary).getByText(/will be able to read:/)).toBeInTheDocument()
    const seen = within(within(summary).getByRole('list', { name: 'Attributes it will see' }))
    expect(seen.getByText('profile.name')).toBeInTheDocument()
    expect(seen.getByText('profile.sizes.shoe')).toBeInTheDocument()
    expect(seen.queryByText('health.allergies')).not.toBeInTheDocument()
    expect(
      within(summary).getByText(/Access lasts 7 days from the moment you approve/),
    ).toBeInTheDocument()
  })

  it('approves with narrowed scopes, a shorter duration and a read cap; the grant shows the narrowed terms', async () => {
    const { user, backend } = await openInbox()
    await user.click(await screen.findByRole('button', { name: 'Review and approve Stride Shoes' }))
    const form = dialog()
    await user.click(form.getByRole('checkbox', { name: 'profile.name:read' }))
    await user.clear(form.getByLabelText(/^Access lasts for/))
    await user.type(form.getByLabelText(/^Access lasts for/), '3')
    await user.type(form.getByLabelText(/^Limit on reads/), '5')

    const summary = form.getByRole('region', { name: 'What this app will see' })
    expect(within(summary).queryByText('profile.name')).not.toBeInTheDocument()
    expect(
      within(summary).getByText(/Access lasts 3 days.*for at most 5 reads/),
    ).toBeInTheDocument()

    await user.click(form.getByRole('button', { name: 'Approve access' }))
    expect(await screen.findByText('Access approved')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const approve = callsTo(backend, 'POST', '/approve')[0]
    expect(approve?.body).toEqual({
      scopes: ['profile.sizes:read'],
      durationSeconds: 3 * 86_400,
      maxReads: 5,
      maxSensitivity: 'SENSITIVE',
    })
    expect(screen.queryByRole('group', { name: 'Stride Shoes' })).not.toBeInTheDocument()
    expect(await card('Meal Planner')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Grants' }))
    await pageHeading('Grants')
    const list = await screen.findByRole('list', { name: 'Active grants' })
    const newest = within(within(list).getAllByRole('listitem')[0] as HTMLElement)
    expect(newest.getByText('profile.sizes:read')).toBeInTheDocument()
    expect(newest.queryByText('profile.name:read')).not.toBeInTheDocument()
    expect(newest.getByText('0 of 5 reads')).toBeInTheDocument()
  })

  it('never lets the owner widen a request: duration, reads and scope count are validated', async () => {
    const { user, backend } = await openInbox()
    await user.click(await screen.findByRole('button', { name: 'Review and approve Stride Shoes' }))
    const form = dialog()

    await user.clear(form.getByLabelText(/^Access lasts for/))
    await user.type(form.getByLabelText(/^Access lasts for/), '8')
    await user.type(form.getByLabelText(/^Limit on reads/), '21')
    await user.click(form.getByRole('checkbox', { name: 'profile.name:read' }))
    await user.click(form.getByRole('checkbox', { name: 'profile.sizes:read' }))
    await user.click(form.getByRole('button', { name: 'Approve access' }))

    expect(
      await form.findByText(/You can only shorten this. The app asked for 7 days/),
    ).toBeInTheDocument()
    expect(
      form.getByText(/You can only lower this. The app asked for 20 reads/),
    ).toBeInTheDocument()
    expect(form.getByText(/Keep at least one scope/)).toBeInTheDocument()
    expect(callsTo(backend, 'POST', '/approve')).toHaveLength(0)
  })

  it('withholds attributes above the chosen sensitivity ceiling', async () => {
    const { user } = await openInbox()
    await user.click(await screen.findByRole('button', { name: 'Review and approve Meal Planner' }))
    const form = dialog()
    const summary = form.getByRole('region', { name: 'What this app will see' })
    expect(within(summary).getByText('health.allergies')).toBeInTheDocument()
    await user.selectOptions(form.getByLabelText(/^Most sensitive level/), 'PERSONAL')
    expect(
      within(summary).getByText(/Withheld because they are above PERSONAL: health.allergies/),
    ).toBeInTheDocument()
    expect(within(summary).getByText('preferences.diet')).toBeInTheDocument()
  })

  it('shows the server message when the request was decided elsewhere meanwhile', async () => {
    const { user, runtime } = await openInbox()
    await user.click(await screen.findByRole('button', { name: 'Review and approve Stride Shoes' }))
    const pending = await runtime.apiClient.get<{ id: string; clientName: string }[]>(
      paths.requests,
      {
        query: { status: 'PENDING' },
      },
    )
    const stride = pending.find((r) => r.clientName === 'Stride Shoes')
    await runtime.apiClient.post(paths.deny(stride?.id ?? ''), {})
    await user.click(dialog().getByRole('button', { name: 'Approve access' }))
    expect(await dialog().findByText('Request was already DENIED')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('denies after confirmation and records the outcome in past requests', async () => {
    const { user, backend } = await openInbox()
    await user.click(await screen.findByRole('button', { name: 'Deny Meal Planner' }))
    expect(screen.getByRole('dialog', { name: 'Deny Meal Planner?' })).toBeInTheDocument()
    await user.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(await card('Meal Planner')).toBeInTheDocument()
    expect(callsTo(backend, 'POST', '/deny')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Deny Meal Planner' }))
    await user.type(dialog().getByLabelText('Note (optional)'), 'Too broad')
    await user.click(dialog().getByRole('button', { name: 'Deny request' }))
    expect(await screen.findByText('Request denied')).toBeInTheDocument()
    expect(callsTo(backend, 'POST', '/deny')[0]?.body).toEqual({ note: 'Too broad' })
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Meal Planner' })).not.toBeInTheDocument(),
    )

    await user.click(screen.getByRole('tab', { name: 'Past requests' }))
    const table = await screen.findByRole('table', { name: 'Past requests' })
    const row = within(table)
      .getAllByRole('row')
      .find((r) => within(r).queryByText('Meal Planner'))
    expect(within(row as HTMLElement).getByText('Denied')).toBeInTheDocument()
  })

  it('treats requests older than the gateway TTL as expired: not in the inbox, listed as expired', async () => {
    let now = Date.now()
    const backend = createMockBackend({ now: () => now })
    now += 8 * 86_400_000
    const { user } = await openInbox({ backend })
    expect(await screen.findByRole('heading', { name: 'No requests waiting' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Past requests' }))
    const table = await screen.findByRole('table', { name: 'Past requests' })
    expect(within(table).getAllByText('Expired').length).toBeGreaterThan(0)
  })

  it('shows an error with retry when the inbox cannot load', async () => {
    const backend = createMockBackend()
    backend.failNext(/GET \/v1\/owner\/requests/, 500, 'boom')
    const { user } = await openInbox({ backend })
    expect(await screen.findByRole('alert')).toHaveTextContent('The gateway had a problem')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await card('Stride Shoes')).toBeInTheDocument()
  })
})
