import { describe, expect, it } from 'vitest'
import { sumMinor } from '../../lib/money'
import { apiFor } from '../../test/fixtures'
import { findField, getField, renderApp, screen, waitFor, within } from '../../test/renderApp'

const posts = (backend: { requests: { method: string; path: string }[] }, suffix: string) =>
  backend.requests.filter((r) => r.method === 'POST' && r.path.endsWith(suffix))

describe('deposit, spend and transfer move the balances', () => {
  it('records a deposit and the dashboard shows the new pool balance', async () => {
    const { user, backend, householdId } = renderApp({ path: 'move?tab=deposit' })
    await user.type(await findField('Amount'), '25.50')
    await user.type(getField('What is it for?'), 'Lemonade stand')
    await user.click(screen.getByRole('button', { name: 'Record deposit' }))

    expect(await screen.findByText('Deposit recorded')).toBeInTheDocument()
    expect(screen.getByText(/only records money you already hold/i)).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_030 + 2_550)

    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(await screen.findByText('$2,195.80')).toBeInTheDocument()
  }, 20_000)

  it('validates before calling the server and shows what is wrong', async () => {
    const { user, backend } = renderApp({ path: 'move?tab=deposit' })
    await user.click(await screen.findByRole('button', { name: 'Record deposit' }))
    expect(await screen.findByText('Enter an amount.')).toBeInTheDocument()
    expect(screen.getByText(/add a short description/i)).toBeInTheDocument()
    await user.type(getField('Amount'), '1.999')
    await user.click(screen.getByRole('button', { name: 'Record deposit' }))
    expect(await screen.findByText(/at most 2 decimal places/i)).toBeInTheDocument()
    expect(posts(backend, '/deposits')).toHaveLength(0)
  })

  it('records a spend in a category and lowers the pool', async () => {
    const { user, backend, householdId } = renderApp({ path: 'move?tab=spend' })
    await user.selectOptions(await findField('Category'), 'Groceries')
    await user.type(getField('Amount'), '40')
    await user.type(getField('What is it for?'), 'Market run')
    await user.click(screen.getByRole('button', { name: 'Record spend' }))

    expect(await screen.findByText('Spend recorded')).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_030 - 4_000)
    expect(backend.balanceOf(householdId, 'EXPENSE:GROCERIES')).toBe(
      8_640 + 5_420 + 9_175 + 7_330 + 4_000,
    )
    expect(posts(backend, '/spends')[0]).toBeTruthy()
  })

  it('transfers from the pool into a member pot', async () => {
    const { user, backend, householdId } = renderApp({ path: 'move?tab=transfer' })
    const to = await findField('To')
    await user.selectOptions(to, within(to).getByRole('option', { name: /sam okafor pot/i }))
    await user.type(getField('Amount'), '15')
    await user.type(getField('What is it for?'), 'Cinema money')
    await user.click(screen.getByRole('button', { name: 'Record transfer' }))

    expect(await screen.findByText('Transfer recorded')).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_030 - 1_500)
    expect(backend.balanceOf(householdId, 'POT:u-sam')).toBe(5_167 + 1_500)
  })

  it('refuses to transfer between the same account before asking the server', async () => {
    const { user } = renderApp({ path: 'move?tab=transfer' })
    const from = await findField('From')
    const to = getField('To')
    // The destination list never offers the source account.
    expect(within(to).queryByRole('option', { name: /household pool/i })).not.toBeInTheDocument()
    expect(within(from).getByRole('option', { name: /household pool/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record transfer' }))
    expect(await screen.findByText('Enter an amount.')).toBeInTheDocument()
  })

  it('shows a plain overdraft message and leaves balances untouched', async () => {
    const { user, backend, householdId } = renderApp({ uid: 'u-sam', path: 'move?tab=spend' })
    const from = await findField('Paid from')
    await user.selectOptions(from, within(from).getByRole('option', { name: /sam okafor pot/i }))
    await user.type(getField('Amount'), '60')
    await user.type(getField('What is it for?'), 'Too much')
    await user.click(screen.getByRole('button', { name: 'Record spend' }))

    expect(await screen.findByText(/not enough money/i)).toHaveTextContent(
      /only has \$51\.67 available/i,
    )
    expect(screen.getByText(/nothing was recorded/i)).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POT:u-sam')).toBe(5_167)
    expect(screen.queryByText('Spend recorded')).not.toBeInTheDocument()
  })
})

describe('split an expense', () => {
  const fillSplit = async (user: ReturnType<typeof renderApp>['user'], total: string) => {
    await user.selectOptions(await findField('Category'), 'Fun and outings')
    await user.type(getField('Total to split'), total)
    await user.type(getField('What is it for?'), 'Mini golf')
  }

  it('previews the exact split live, with leftover cents going to the largest remainders', async () => {
    const { user } = renderApp({ path: 'move?tab=split' })
    await fillSplit(user, '100')
    // Everyone is included by default: four pots, equal weights.
    let preview = screen.getByRole('table', { name: 'Split preview' })
    expect(
      within(preview)
        .getAllByRole('row')
        .slice(1, 5)
        .map((r) => within(r).getAllByRole('cell').at(-1)!.textContent),
    ).toEqual(['$25.00', '$25.00', '$25.00', '$25.00'])

    await user.click(screen.getByRole('checkbox', { name: 'Dev Okafor' }))
    preview = screen.getByRole('table', { name: 'Split preview' })
    const shares = () =>
      within(screen.getByRole('table', { name: 'Split preview' }))
        .getAllByRole('row')
        .slice(1, -1)
        .map((r) => [
          within(r).getAllByRole('cell')[0]!.textContent,
          within(r).getAllByRole('cell').at(-1)!.textContent,
        ])
    expect(shares()).toEqual([
      ['Maya Okafor pot', '$33.34'],
      ['Sam Okafor pot', '$33.33'],
      ['Ada Okafor pot', '$33.33'],
    ])
    expect(screen.getByText(/add up to exactly \$100\.00/i)).toBeInTheDocument()

    // Weights change the preview immediately.
    const weight = getField('Weight for Maya Okafor')
    await user.clear(weight)
    await user.type(weight, '2')
    expect(shares()).toEqual([
      ['Maya Okafor pot', '$50.00'],
      ['Sam Okafor pot', '$25.00'],
      ['Ada Okafor pot', '$25.00'],
    ])
    const total = within(screen.getByRole('table', { name: 'Split preview' }))
      .getAllByRole('row')
      .at(-1)!
    expect(within(total).getAllByRole('cell').at(-1)).toHaveTextContent('$100.00')
  })

  it('posts exactly what was previewed, and the server agrees', async () => {
    const { user, backend, householdId } = renderApp({ path: 'move?tab=split' })
    await fillSplit(user, '70.01')
    await user.click(screen.getByRole('checkbox', { name: 'Dev Okafor' }))
    const previewed = within(screen.getByRole('table', { name: 'Split preview' }))
      .getAllByRole('row')
      .slice(1, -1)
      .map((r) => within(r).getAllByRole('cell').at(-1)!.textContent)
    expect(previewed).toEqual(['$23.34', '$23.34', '$23.33'])

    await user.click(screen.getByRole('button', { name: 'Record split' }))
    expect(await screen.findByText('Split recorded')).toBeInTheDocument()
    const recorded = within(screen.getByRole('table', { name: 'Recorded split' }))
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell').at(-1)!.textContent)
    expect(recorded).toEqual(previewed)

    const entry = (await apiFor(backend, 'u-maya').listEntries(householdId, 0, 1))[0]!
    expect(entry.kind).toBe('SPLIT')
    const debits = entry.postings.filter((p) => p.amountMinor < 0).map((p) => -p.amountMinor)
    expect(sumMinor(debits)).toBe(7_001)
    expect(debits).toEqual([2_334, 2_334, 2_333])
  })

  it('refuses a split that would overdraw a pot and records nothing', async () => {
    const { user, backend, householdId } = renderApp({ path: 'move?tab=split' })
    await fillSplit(user, '100.01')
    await user.click(screen.getByRole('checkbox', { name: 'Dev Okafor' }))
    await user.click(screen.getByRole('button', { name: 'Record split' }))
    expect(await screen.findByText(/not enough money/i)).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POT:u-ada')).toBe(2_667)
    expect(screen.queryByText('Split recorded')).not.toBeInTheDocument()
  })

  it('asks for at least one pot and valid weights', async () => {
    const { user } = renderApp({ path: 'move?tab=split' })
    await fillSplit(user, '10')
    for (const name of ['Maya Okafor', 'Dev Okafor', 'Sam Okafor', 'Ada Okafor']) {
      await user.click(screen.getByRole('checkbox', { name }))
    }
    expect(screen.getByText(/enter a total and choose who shares it/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record split' }))
    expect(await screen.findByText(/choose at least one pot/i)).toBeInTheDocument()
  })

  it('is only offered to owners and approvers', async () => {
    renderApp({ uid: 'u-sam', path: 'move?tab=split' })
    await screen.findByRole('tab', { name: 'Deposit' })
    expect(screen.queryByRole('tab', { name: /split/i })).not.toBeInTheDocument()
  })
})

describe('a double submit can never post twice', () => {
  it('posts once when the button is double-clicked', async () => {
    const { user, backend, householdId } = renderApp({ path: 'move?tab=deposit' })
    await user.type(await findField('Amount'), '10')
    await user.type(getField('What is it for?'), 'Double tap')
    await user.dblClick(screen.getByRole('button', { name: 'Record deposit' }))

    expect(await screen.findByText('Deposit recorded')).toBeInTheDocument()
    expect(posts(backend, '/deposits')).toHaveLength(1)
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_030 + 1_000)
  })

  it('reuses the same Idempotency-Key when a retry follows a lost response, so the server replays', async () => {
    const { user, backend, householdId } = renderApp({ path: 'move?tab=deposit' })
    await user.type(await findField('Amount'), '10')
    await user.type(getField('What is it for?'), 'Flaky wifi')

    backend.dropNextResponses(1)
    await user.click(screen.getByRole('button', { name: 'Record deposit' }))
    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument()
    // The server did commit it, but the browser never heard.
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_030 + 1_000)

    await user.click(screen.getByRole('button', { name: 'Record deposit' }))
    expect(await screen.findByText('Deposit recorded')).toBeInTheDocument()

    const sent = posts(backend, '/deposits') as unknown as { headers: Record<string, string> }[]
    expect(sent).toHaveLength(2)
    expect(sent[0]!.headers['idempotency-key']).toBeTruthy()
    expect(sent[1]!.headers['idempotency-key']).toBe(sent[0]!.headers['idempotency-key'])
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_030 + 1_000)
  })

  it('explains a 409 key conflict and recovers with a fresh key', async () => {
    const { user, backend, householdId } = renderApp({ path: 'move?tab=deposit' })
    await user.type(await findField('Amount'), '10')
    await user.type(getField('What is it for?'), 'Edited after a failure')
    backend.dropNextResponses(1)
    await user.click(screen.getByRole('button', { name: 'Record deposit' }))
    await screen.findByText(/could not reach the server/i)

    // Changing the amount and resubmitting reuses the old key with different content: the server says no.
    const amount = getField('Amount')
    await user.clear(amount)
    await user.type(amount, '20')
    await user.click(screen.getByRole('button', { name: 'Record deposit' }))
    expect(await screen.findByText(/repeat of an earlier submission/i)).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_030 + 1_000)

    await user.click(screen.getByRole('button', { name: 'Record deposit' }))
    expect(await screen.findByText('Deposit recorded')).toBeInTheDocument()
    expect(backend.balanceOf(householdId, 'POOL')).toBe(217_030 + 1_000 + 2_000)
    const keys = (
      posts(backend, '/deposits') as unknown as { headers: Record<string, string> }[]
    ).map((r) => r.headers['idempotency-key'])
    expect(keys).toHaveLength(3)
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
  })

  it('uses a new key for each new form, and a new key after a successful post', async () => {
    const { user, backend } = renderApp({ path: 'move?tab=deposit' })
    const fillAndSend = async (amount: string) => {
      await user.type(await findField('Amount'), amount)
      await user.type(getField('What is it for?'), `Gift ${amount}`)
      await user.click(screen.getByRole('button', { name: 'Record deposit' }))
      await screen.findByText('Deposit recorded')
    }
    await fillAndSend('5')
    await user.click(screen.getByRole('button', { name: 'Record another deposit' }))
    await fillAndSend('6')
    const keys = (
      posts(backend, '/deposits') as unknown as { headers: Record<string, string> }[]
    ).map((r) => r.headers['idempotency-key'])
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])
    await waitFor(() => expect(screen.getByText('Deposit recorded')).toBeInTheDocument())
  })
})
