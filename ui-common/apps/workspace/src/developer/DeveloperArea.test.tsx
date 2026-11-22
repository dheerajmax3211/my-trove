import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderDemo } from '../testing/harness'

const sectionNav = () => screen.getByRole('navigation', { name: 'Developer sections' })

/** The page transition keeps the outgoing page mounted for about 140 ms; wait it out before using the new page. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

async function openSection(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(within(sectionNav()).getByRole('link', { name: label }))
  await settle()
}

describe('developer console access', () => {
  it('opens for a developer: the overview, its permissions, and the demo label', async () => {
    renderDemo('DEVELOPER', { path: '/developer' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Developer' })).toBeInTheDocument()
    expect(screen.getAllByText('Demo data')[0]!).toBeInTheDocument()
    const held = screen.getByRole('list', { name: 'Developer permissions you hold' })
    expect(within(held).getByText('apps:manage')).toBeInTheDocument()
    expect(within(held).queryByText('plans:manage')).not.toBeInTheDocument()
  })

  it('shows the plan limits in use: keys and endpoints against the DEVELOPER plan', async () => {
    renderDemo('DEVELOPER', { path: '/developer' })
    expect(
      await screen.findByRole('img', { name: 'Active keys: 0 of 50 used' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Active endpoints: 0 of 20 used' })).toBeInTheDocument()
  })

  it('is open to the owner, who holds every developer permission', async () => {
    renderDemo('OWNER', { path: '/developer' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Developer' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Developer permissions you hold' })).toBeInTheDocument()
  })

  it('refuses a member with the missing permission named, and no developer screen', async () => {
    renderDemo('MEMBER', { path: '/developer/keys' })
    const forbidden = await screen.findByTestId('forbidden')
    expect(
      within(forbidden).getByRole('heading', { name: 'Developer is not part of your role' }),
    ).toBeInTheDocument()
    expect(within(forbidden).getByText('apps:manage')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Developer sections' })).not.toBeInTheDocument()
  })
})

describe('apps', () => {
  it('checks the form in plain words and makes no request until it is valid', async () => {
    const user = userEvent.setup()
    renderDemo('DEVELOPER', { path: '/developer/apps' })
    await user.click(await screen.findByRole('button', { name: 'Register an app' }))
    const dialog = await screen.findByRole('dialog', { name: 'Register an app' })

    await user.click(within(dialog).getByRole('button', { name: 'Register app' }))
    expect(within(dialog).getByText('Enter a name for the app.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/^Name/), 'Notes')
    await user.type(
      within(dialog).getByLabelText('Redirect addresses'),
      'http://notes.example.test/cb',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Register app' }))
    expect(within(dialog).getByText(/Plain http:\/\/ is allowed only/)).toBeInTheDocument()
  })

  it('registers an app, shows its client secret once, then opens the app', async () => {
    const user = userEvent.setup()
    renderDemo('DEVELOPER', { path: '/developer/apps' })
    await user.click(await screen.findByRole('button', { name: 'Register an app' }))
    const dialog = await screen.findByRole('dialog', { name: 'Register an app' })
    await user.type(within(dialog).getByLabelText(/^Name/), 'Notes')
    await user.type(
      within(dialog).getByLabelText('Redirect addresses'),
      'https://notes.example.test/cb',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Register app' }))

    expect(
      await screen.findByRole('dialog', { name: 'Client secret for Notes' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Shown once')).toBeInTheDocument()
    expect(screen.getByTestId('secret-value').textContent).toMatch(/^cs_/)
    await user.click(screen.getByRole('button', { name: 'I have copied it' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Notes' })).toBeInTheDocument()
    expect(screen.getByText(/A secret is set/)).toBeInTheDocument()
  })
})

describe('API keys', () => {
  it('issues a key with a scope, shows it once, lists its prefix, and revokes it after confirmation', async () => {
    const user = userEvent.setup()
    renderDemo('DEVELOPER', { path: '/developer/keys' })
    const form = await screen.findByRole('form', { name: 'Issue a key' })
    await user.selectOptions(within(form).getByLabelText(/^App/), 'Sample app (demo)')
    await user.type(within(form).getByLabelText(/^Key name/), 'staging')
    await user.click(within(form).getByRole('checkbox', { name: 'usage:read' }))
    await user.click(within(form).getByRole('button', { name: 'Issue key' }))

    expect(await screen.findByRole('dialog', { name: 'Key staging is ready' })).toBeInTheDocument()
    const key = screen.getByTestId('secret-value').textContent ?? ''
    expect(key).toMatch(/^pk_[0-9a-f]{8}_/)
    await user.click(screen.getByRole('button', { name: 'I have copied it' }))

    const table = await screen.findByRole('table')
    expect(within(table).getByText(`${key.slice(0, 11)}…`)).toBeInTheDocument()
    expect(within(table).getByText('Active')).toBeInTheDocument()

    await user.click(within(table).getByRole('button', { name: 'Revoke staging' }))
    const confirm = await screen.findByRole('dialog', { name: 'Revoke staging?' })
    expect(within(confirm).getByText(/about a minute/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Revoke key' }))
    await waitFor(() => expect(within(table).getByText('Revoked')).toBeInTheDocument())
  })

  it('will not issue a key without a scope and says so next to the scopes', async () => {
    const user = userEvent.setup()
    renderDemo('DEVELOPER', { path: '/developer/keys' })
    const form = await screen.findByRole('form', { name: 'Issue a key' })
    await user.selectOptions(within(form).getByLabelText(/^App/), 'Sample app (demo)')
    await user.type(within(form).getByLabelText(/^Key name/), 'no scope')
    await user.click(within(form).getByRole('button', { name: 'Issue key' }))
    expect(within(form).getByText('Pick at least one scope.')).toBeInTheDocument()
  })
})

describe('webhooks', () => {
  it('refuses a plain http address, adds an endpoint with its signing secret once, and replays a delivery', async () => {
    const user = userEvent.setup()
    renderDemo('DEVELOPER', { path: '/developer/webhooks' })
    const form = await screen.findByRole('form', { name: 'Add an endpoint' })
    await user.selectOptions(within(form).getByLabelText(/^App/), 'Sample app (demo)')
    await user.type(within(form).getByLabelText(/^Address/), 'http://hooks.example.test/x')
    await user.click(within(form).getByRole('checkbox', { name: 'reminder.created' }))
    await user.click(within(form).getByRole('button', { name: 'Add endpoint' }))
    expect(within(form).getByText(/Plain http:\/\/ is allowed only/)).toBeInTheDocument()

    await user.clear(within(form).getByLabelText(/^Address/))
    await user.type(within(form).getByLabelText(/^Address/), 'https://hooks.example.test/x')
    await user.click(within(form).getByRole('button', { name: 'Add endpoint' }))

    expect(
      await screen.findByRole('dialog', {
        name: 'Signing secret for https://hooks.example.test/x',
      }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('secret-value').textContent).toMatch(/^whsec_/)
    await user.click(screen.getByRole('button', { name: 'I have copied it' }))

    const log = await screen.findByRole('table')
    expect(within(log).getByText('Delivered')).toBeInTheDocument()
    await user.click(within(log).getByRole('button', { name: 'Replay reminder.created' }))
    expect(await screen.findByText(/Replaying reminder.created/)).toBeInTheDocument()
  })
})

describe('API docs', () => {
  it('says which documents are published, and shows the first request with a placeholder key', async () => {
    renderDemo('DEVELOPER', { path: '/developer/docs' })
    const list = await screen.findByRole('list', { name: 'API documents' })
    expect(within(list).getAllByText('Not published yet')).toHaveLength(8)
    expect(within(list).getByText('platform')).toBeInTheDocument()
    expect(screen.getByLabelText('First request').textContent).toContain('pk_xxxxxxxx_your_key')
  })
})

describe('playground', () => {
  it('sends a request with a key through the gateway, and refuses what the key may not call', async () => {
    const user = userEvent.setup()
    renderDemo('DEVELOPER', { path: '/developer/keys' })
    const form = await screen.findByRole('form', { name: 'Issue a key' })
    await user.selectOptions(within(form).getByLabelText(/^App/), 'Sample app (demo)')
    await user.type(within(form).getByLabelText(/^Key name/), 'playground')
    await user.click(within(form).getByRole('checkbox', { name: 'usage:read' }))
    await user.click(within(form).getByRole('button', { name: 'Issue key' }))
    await screen.findByRole('dialog', { name: 'Key playground is ready' })
    const key = screen.getByTestId('secret-value').textContent ?? ''
    await user.click(screen.getByRole('button', { name: 'I have copied it' }))

    await openSection(user, 'Playground')
    // The page transition keeps the outgoing page for a moment; let it finish before the form is used.
    await settle()
    const send = () => screen.getByRole('form', { name: 'Send a request' })
    await user.selectOptions(
      within(send()).getByLabelText(/^Key\*?$/),
      `playground (${key.slice(0, 11)}…)`,
    )
    await user.type(within(send()).getByLabelText(/^Key value/), 'pk_wrong_value')
    await user.click(within(send()).getByRole('button', { name: 'Send request' }))
    expect(await within(send()).findByText(/This is not the key you chose/)).toBeInTheDocument()

    await user.clear(within(send()).getByLabelText(/^Key value/))
    await user.type(within(send()).getByLabelText(/^Key value/), key)
    const path = within(send()).getByDisplayValue('/platform/v1/usage/me')
    await user.clear(path)
    await user.type(path, '/platform/v1/developer/apps')
    await user.click(within(send()).getByRole('button', { name: 'Send request' }))
    expect(
      await within(send()).findByText(
        'API keys cannot call this route. Only the routes listed for keys are open to them.',
      ),
    ).toBeInTheDocument()

    await user.clear(within(send()).getByRole('textbox', { name: 'Path' }))
    await user.type(within(send()).getByRole('textbox', { name: 'Path' }), '/platform/v1/usage/me')
    await user.click(within(send()).getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('heading', { name: /^Response 200/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Response body').textContent).toContain('totalRequests')
  })
})
