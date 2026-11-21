import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockBackend } from '../../mock/backend'
import { pageHeading, renderApp } from '../../test/utils'

async function openAudit(options: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp({ route: '/audit', ...options })
  await pageHeading('Audit')
  return app
}

describe('audit chain verification', () => {
  it('does nothing until asked, then reports an intact chain', async () => {
    const { user, backend } = await openAudit()
    expect(screen.getByText(/Not checked yet/)).toBeInTheDocument()
    expect(backend.calls.some((c) => c.path.includes('/audit/verify'))).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Verify chain' }))
    const ok = await screen.findByRole('status')
    expect(within(ok).getByText('Audit log intact')).toBeInTheDocument()
    expect(within(ok).getByText(/All 21 entries were re-checked/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verify again' })).toBeInTheDocument()
  })

  it.each([
    ['edit-entry', 'Entry #4 was changed after it was written', 'ENTRY_HASH_MISMATCH', '#4'],
    ['delete-entry', 'Entry #4 is missing or out of order', 'SEQUENCE_GAP', '#4'],
    ['truncate', 'The log is missing entries from #21 onwards', 'HEAD_MISMATCH', '#21'],
  ] as const)('names the first broken link after a %s', async (kind, headline, reason, seq) => {
    const { user, backend } = await openAudit()
    backend.tamperAudit(kind, 4)
    await user.click(screen.getByRole('button', { name: 'Verify chain' }))
    const broken = await screen.findByRole('alert')
    expect(within(broken).getByText('Audit log broken')).toBeInTheDocument()
    expect(within(broken).getByText(new RegExp(headline))).toBeInTheDocument()
    expect(within(broken).getByText(reason)).toBeInTheDocument()
    expect(within(broken).getByText(seq)).toBeInTheDocument()
  })

  it('turns from OK to broken when verified again after tampering', async () => {
    const { user, backend } = await openAudit()
    await user.click(screen.getByRole('button', { name: 'Verify chain' }))
    expect(await screen.findByText('Audit log intact')).toBeInTheDocument()
    backend.tamperAudit('edit-entry', 2)
    await user.click(screen.getByRole('button', { name: 'Verify again' }))
    expect(await screen.findByText('Audit log broken')).toBeInTheDocument()
    expect(screen.queryByText('Audit log intact')).not.toBeInTheDocument()
  })

  it('catches the demo tamper button end to end', async () => {
    const { user } = await openAudit()
    await user.click(screen.getByRole('button', { name: 'Tamper with the audit log' }))
    await user.click(screen.getByRole('button', { name: 'Verify chain' }))
    expect(await screen.findByText('Audit log broken')).toBeInTheDocument()
  })

  it('shows an error with retry when verification fails to run', async () => {
    const backend = createMockBackend()
    const { user } = await openAudit({ backend })
    backend.failNext(/GET \/v1\/owner\/audit\/verify/, 500, 'boom')
    await user.click(screen.getByRole('button', { name: 'Verify chain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The gateway had a problem')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Audit log intact')).toBeInTheDocument()
  })
})
