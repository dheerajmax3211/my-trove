import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderDemo } from '../testing/harness'

const SAMPLE = 'Sample app (demo)'

/** Opens the seeded sample app's detail page from the apps list. The shell moves focus to the new page's heading a
 *  moment after a navigation, so the helper lets that happen before anything is typed. */
async function openSampleApp(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('link', { name: SAMPLE }))
  const heading = await screen.findByRole('heading', { level: 2, name: SAMPLE })
  await new Promise((resolve) => setTimeout(resolve, 400))
  return heading
}

describe('changing an app', () => {
  it('saves edits to the name and redirect addresses, and says so', async () => {
    const user = userEvent.setup()
    renderDemo('DEVELOPER', { path: '/developer/apps' })
    await openSampleApp(user)

    const details = screen.getByRole('region', { name: 'Details' })
    const name = within(details).getByLabelText(/^Name/)
    await user.clear(name)
    await user.type(name, 'Renamed sample')
    await user.click(within(details).getByRole('button', { name: 'Save changes' }))

    expect(await within(details).findByText('Saved.')).toBeInTheDocument()
    // The header follows the refetch that the save triggers, which lands after the confirmation.
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Renamed sample' }, { timeout: 5000 }),
    ).toBeInTheDocument()
  }, 15_000)

  it('rotates the client secret after confirmation, and shows the new one once', async () => {
    const user = userEvent.setup()
    renderDemo('DEVELOPER', { path: '/developer/apps' })
    await openSampleApp(user)

    await user.click(screen.getByRole('button', { name: 'Rotate secret' }))
    const confirm = await screen.findByRole('dialog', { name: 'Rotate the client secret?' })
    expect(within(confirm).getByText(/stops matching at once/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Rotate secret' }))

    expect(
      await screen.findByRole('dialog', { name: `New client secret for ${SAMPLE}` }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('secret-value').textContent).toMatch(/^cs_/)
    await user.click(screen.getByRole('button', { name: 'I have copied it' }))
  })

  it('deletes the app after confirmation and leaves it marked as deleted in the list', async () => {
    const user = userEvent.setup()
    renderDemo('DEVELOPER', { path: '/developer/apps' })
    await openSampleApp(user)

    await user.click(screen.getByRole('button', { name: 'Delete app' }))
    const confirm = await screen.findByRole('dialog', { name: `Delete ${SAMPLE}?` })
    expect(within(confirm).getByText(/cannot be undone/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Delete app' }))

    const list = await screen.findByRole('list', { name: 'Your apps' })
    await waitFor(() => expect(within(list).getByText('Deleted')).toBeInTheDocument())
  })
})

describe('changing a webhook endpoint', () => {
  async function addEndpoint(user: ReturnType<typeof userEvent.setup>, url: string) {
    const form = await screen.findByRole('form', { name: 'Add an endpoint' })
    await user.selectOptions(within(form).getByLabelText(/^App/), SAMPLE)
    await user.type(within(form).getByLabelText(/^Address/), url)
    await user.click(within(form).getByRole('checkbox', { name: 'reminder.created' }))
    await user.click(within(form).getByRole('button', { name: 'Add endpoint' }))
    await user.click(await screen.findByRole('button', { name: 'I have copied it' }))
  }

  it('rotates the signing secret after confirmation, and shows the new one once', async () => {
    const user = userEvent.setup()
    renderDemo('DEVELOPER', { path: '/developer/webhooks' })
    await addEndpoint(user, 'https://hooks.example.test/rotate')

    const list = await screen.findByRole('list', { name: 'Webhook endpoints' })
    await user.click(within(list).getByRole('button', { name: 'Rotate secret' }))
    const confirm = await screen.findByRole('dialog', { name: 'Rotate the signing secret?' })
    await user.click(within(confirm).getByRole('button', { name: 'Rotate secret' }))

    expect(
      await screen.findByRole('dialog', {
        name: 'New signing secret for https://hooks.example.test/rotate',
      }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('secret-value').textContent).toMatch(/^whsec_/)
  })

  it('disables an endpoint after confirmation, which frees its slot on the plan', async () => {
    const user = userEvent.setup()
    renderDemo('DEVELOPER', { path: '/developer/webhooks' })
    await addEndpoint(user, 'https://hooks.example.test/disable')

    const list = await screen.findByRole('list', { name: 'Webhook endpoints' })
    await user.click(within(list).getByRole('button', { name: 'Disable' }))
    const confirm = await screen.findByRole('dialog', { name: 'Disable this endpoint?' })
    expect(within(confirm).getByText(/frees a slot/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Disable endpoint' }))

    await waitFor(() => expect(within(list).getByText('Disabled')).toBeInTheDocument())
    const meter = screen.getByRole('img', { name: /^Active endpoints on your plan/ })
    // The demo persona is on the DEVELOPER plan, which allows 20 endpoints.
    expect(meter.getAttribute('aria-label')).toBe('Active endpoints on your plan: 0 of 20 used')
  })
})
