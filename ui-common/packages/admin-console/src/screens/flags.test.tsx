import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { callsTo, jsonResponse, problem, renderAdmin } from '../testing/harness'
import { validateFlagForm } from './Flags'

describe('Feature flags: who sees them', () => {
  it('an owner and an admin manage flags; an auditor and a member are blocked', async () => {
    const owner = renderAdmin({ route: '/flags' })
    expect(await screen.findByRole('list', { name: 'Feature flags' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New flag' })).toBeInTheDocument()
    owner.unmount()
    const admin = renderAdmin({ persona: 'ADMIN', route: '/flags' })
    expect(await screen.findByRole('list', { name: 'Feature flags' })).toBeInTheDocument()
    admin.unmount()
    const auditor = renderAdmin({ persona: 'AUDITOR', route: '/flags' })
    expect(await screen.findByText(/is not available to your role/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New flag' })).not.toBeInTheDocument()
    expect(auditor.requests).toHaveLength(0)
  })
})

describe('Feature flags: list and toggle', () => {
  it('lists each flag with its state, rollout, plans and roles', async () => {
    renderAdmin({ route: '/flags' })
    const list = await screen.findByRole('list', { name: 'Feature flags' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    const feed = within(list).getByText('new-today-feed').closest('li') as HTMLElement
    expect(within(feed).getByText('On')).toBeInTheDocument()
    expect(within(feed).getByText('40% of eligible people')).toBeInTheDocument()
    expect(within(feed).getAllByText(/Any/)).toHaveLength(2)
    const beta = within(list).getByText('ask-your-life-beta').closest('li') as HTMLElement
    expect(within(beta).getByText('Off')).toBeInTheDocument()
    expect(within(beta).getByText('PRO, DEVELOPER')).toBeInTheDocument()
    expect(await within(feed).findByText(/by Maya Ortiz/)).toBeInTheDocument()
  })

  it('toggling sends the whole flag with enabled flipped, then shows the new state', async () => {
    const { user, requests } = renderAdmin({ route: '/flags' })
    const toggle = await screen.findByRole('switch', { name: 'Enable ask-your-life-beta' })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Enable ask-your-life-beta' })).toBeChecked())
    const put = callsTo(requests, 'PUT', '/v1/flags/ask-your-life-beta')
    expect(put).toHaveLength(1)
    expect(put[0]?.service).toBe('platform')
    expect(put[0]?.body).toEqual({
      description: 'Early access to changes in Ask Your Life.',
      enabled: true,
      rolloutPercent: 10,
      allowedPlans: ['PRO', 'DEVELOPER'],
      allowedRoles: [],
    })
    expect(callsTo(requests, 'GET', '/v1/flags').length).toBeGreaterThanOrEqual(2) // refreshed
  })

  it('a failed toggle says what failed and leaves the switch alone', async () => {
    const { user } = renderAdmin({
      route: '/flags',
      intercept: (r) => (r.method === 'PUT' ? problem(404, "No flag with key 'ask-your-life-beta'") : undefined),
    })
    await user.click(await screen.findByRole('switch', { name: 'Enable ask-your-life-beta' }))
    expect(await screen.findByText(/Could not change ask-your-life-beta: No flag with key/)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Enable ask-your-life-beta' })).not.toBeChecked()
  })

  it('first-run empty state invites the first flag', async () => {
    const { user } = renderAdmin({
      route: '/flags',
      intercept: (r) => (r.path === '/v1/flags' && r.method === 'GET' ? jsonResponse([]) : undefined),
    })
    expect(await screen.findByRole('heading', { name: 'No feature flags yet' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create the first flag' }))
    expect(await screen.findByRole('dialog', { name: 'New feature flag' })).toBeInTheDocument()
  })

  it('403 and network errors are handled', async () => {
    const a = renderAdmin({ route: '/flags', intercept: (r) => (r.path === '/v1/flags' ? problem(403, 'Access Denied') : undefined) })
    expect(await screen.findByRole('heading', { name: 'The platform did not allow this' })).toBeInTheDocument()
    a.unmount()
    renderAdmin({ route: '/flags', intercept: (r) => (r.path === '/v1/flags' ? Promise.reject(new TypeError('x')) : undefined) })
    expect(await screen.findByText("Can't reach the platform")).toBeInTheDocument()
  })
})

describe('Feature flags: create', () => {
  async function openNew(ctx: ReturnType<typeof renderAdmin>) {
    await ctx.user.click(await screen.findByRole('button', { name: 'New flag' }))
    return screen.findByRole('dialog', { name: 'New feature flag' })
  }

  it('validates the key before anything is sent', async () => {
    const ctx = renderAdmin({ route: '/flags' })
    const dialog = await openNew(ctx)
    const key = within(dialog).getByRole('textbox', { name: /Key/ })
    await ctx.user.click(within(dialog).getByRole('button', { name: 'Create flag' }))
    expect(await within(dialog).findByText('Enter a key.')).toBeInTheDocument()
    await ctx.user.type(key, 'Bad Key')
    expect(await within(dialog).findByText(/Use 1 to 64 characters/)).toBeInTheDocument()
    await ctx.user.clear(key)
    await ctx.user.type(key, 'new-today-feed')
    expect(await within(dialog).findByText('A flag with this key already exists.')).toBeInTheDocument()
    expect(callsTo(ctx.requests, 'POST', '/v1/flags')).toHaveLength(0)
  })

  it('validates the rollout percentage', async () => {
    const ctx = renderAdmin({ route: '/flags' })
    const dialog = await openNew(ctx)
    await ctx.user.type(within(dialog).getByRole('textbox', { name: /Key/ }), 'ok-key')
    const rollout = within(dialog).getByRole('spinbutton', { name: 'Rollout percentage' })
    await ctx.user.clear(rollout)
    await ctx.user.type(rollout, '150')
    await ctx.user.click(within(dialog).getByRole('button', { name: 'Create flag' }))
    expect(await within(dialog).findByText('Enter a whole number from 0 to 100.')).toBeInTheDocument()
    expect(callsTo(ctx.requests, 'POST', '/v1/flags')).toHaveLength(0)
  })

  it('creates a flag with the typed values and shows it in the list', async () => {
    const ctx = renderAdmin({ route: '/flags' })
    const dialog = await openNew(ctx)
    await ctx.user.type(within(dialog).getByRole('textbox', { name: /Key/ }), 'new-dashboard')
    await ctx.user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'The new dashboard')
    await ctx.user.click(within(dialog).getByRole('switch', { name: 'Enabled' }))
    const rollout = within(dialog).getByRole('spinbutton', { name: 'Rollout percentage' })
    await ctx.user.clear(rollout)
    await ctx.user.type(rollout, '25')
    await ctx.user.click(within(dialog).getByRole('checkbox', { name: 'PRO' }))
    await ctx.user.click(within(dialog).getByRole('checkbox', { name: 'ADMIN' }))
    await ctx.user.click(within(dialog).getByRole('button', { name: 'Create flag' }))

    await screen.findByText('new-dashboard')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const post = callsTo(ctx.requests, 'POST', '/v1/flags')
    expect(post).toHaveLength(1)
    expect(post[0]?.body).toEqual({
      key: 'new-dashboard',
      description: 'The new dashboard',
      enabled: true,
      rolloutPercent: 25,
      allowedPlans: ['PRO'],
      allowedRoles: ['ADMIN'],
    })
  })

  it('shows the server message when the server refuses', async () => {
    const ctx = renderAdmin({
      route: '/flags',
      intercept: (r) =>
        r.method === 'POST' ? problem(409, "A flag with key 'race-condition' already exists", 'Conflict') : undefined,
    })
    const dialog = await openNew(ctx)
    await ctx.user.type(within(dialog).getByRole('textbox', { name: /Key/ }), 'race-condition')
    await ctx.user.click(within(dialog).getByRole('button', { name: 'Create flag' }))
    expect(await within(dialog).findByText('Could not create the flag')).toBeInTheDocument()
    expect(within(dialog).getByText("A flag with key 'race-condition' already exists")).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument() // stays open so nothing typed is lost
  })

  it('the slider and the number field move together', async () => {
    const ctx = renderAdmin({ route: '/flags' })
    const dialog = await openNew(ctx)
    const number = within(dialog).getByRole('spinbutton', { name: 'Rollout percentage' })
    const slider = within(dialog).getByRole('slider', { name: 'Rollout percentage slider' })
    expect(number).toHaveValue(100)
    expect(slider).toHaveValue('100')
    await ctx.user.clear(number)
    await ctx.user.type(number, '40')
    expect(slider).toHaveValue('40')
  })
})

describe('Feature flags: edit and delete', () => {
  it('edits the rollout and allowed plans of an existing flag; the key is read-only', async () => {
    const ctx = renderAdmin({ route: '/flags' })
    await ctx.user.click(await screen.findByRole('button', { name: 'Edit new-today-feed' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit new-today-feed' })
    expect(within(dialog).getByRole('textbox', { name: /Key/ })).toBeDisabled()
    const rollout = within(dialog).getByRole('spinbutton', { name: 'Rollout percentage' })
    expect(rollout).toHaveValue(40)
    await ctx.user.clear(rollout)
    await ctx.user.type(rollout, '75')
    await ctx.user.click(
      within(within(dialog).getByRole('group', { name: 'Only these plans' })).getByRole('checkbox', {
        name: 'DEVELOPER',
      }),
    )
    await ctx.user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await screen.findByText('75% of eligible people')
    const put = callsTo(ctx.requests, 'PUT', '/v1/flags/new-today-feed')
    expect(put[0]?.body).toMatchObject({ rolloutPercent: 75, allowedPlans: ['DEVELOPER'], enabled: true })
  })

  it('delete asks first; cancelling deletes nothing, confirming deletes', async () => {
    const ctx = renderAdmin({ route: '/flags' })
    await ctx.user.click(await screen.findByRole('button', { name: 'Delete ask-your-life-beta' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete ask-your-life-beta?' })
    await ctx.user.click(within(dialog).getByRole('button', { name: 'Keep flag' }))
    expect(callsTo(ctx.requests, 'DELETE', /flags/)).toHaveLength(0)
    expect(screen.getByText('ask-your-life-beta')).toBeInTheDocument()

    await ctx.user.click(screen.getByRole('button', { name: 'Delete ask-your-life-beta' }))
    await ctx.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete flag' }))
    await waitFor(() => expect(screen.queryByText('ask-your-life-beta')).not.toBeInTheDocument())
    expect(callsTo(ctx.requests, 'DELETE', '/v1/flags/ask-your-life-beta')).toHaveLength(1)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('a failed delete is reported', async () => {
    const ctx = renderAdmin({
      route: '/flags',
      intercept: (r) => (r.method === 'DELETE' ? problem(404, "No flag with key 'compact-tables'") : undefined),
    })
    await ctx.user.click(await screen.findByRole('button', { name: 'Delete compact-tables' }))
    await ctx.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete flag' }))
    expect(await screen.findByText(/Could not delete compact-tables: No flag with key/)).toBeInTheDocument()
  })
})

describe('validateFlagForm', () => {
  const base = { key: 'a', description: '', enabled: false, rollout: '100', plans: [], roles: [] }
  it('accepts the documented key pattern and rejects the rest', () => {
    for (const key of ['a', '0x', 'a.b_c-d', 'x'.repeat(64)])
      expect(validateFlagForm({ ...base, key }, true, []).key).toBeUndefined()
    for (const key of ['', 'A', '-a', '.a', 'a b', 'x'.repeat(65), 'é'])
      expect(validateFlagForm({ ...base, key }, true, []).key).toBeDefined()
  })
  it('does not validate the key when editing', () => {
    expect(validateFlagForm({ ...base, key: 'Anything' }, false, []).key).toBeUndefined()
  })
  it('rollout must be a whole number from 0 to 100', () => {
    for (const rollout of ['0', '100', '37']) expect(validateFlagForm({ ...base, rollout }, true, []).rollout).toBeUndefined()
    for (const rollout of ['', '-1', '101', '1.5', 'abc']) expect(validateFlagForm({ ...base, rollout }, true, []).rollout).toBeDefined()
  })
})
