import { productModule as askYourLife } from '@platform/ask-your-life/module'
import { productModule as familyTreasury } from '@platform/family-treasury/module'
import { productModule as homePulse } from '@platform/home-pulse/module'
import { productModule as waitingOn } from '@platform/waiting-on/module'
import type { Persona } from '@platform/ui'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authHeader,
  fakeModule,
  json,
  renderDemo,
  renderLive,
  urlOf,
  type Handler,
} from '../testing/harness'
import { FOLLOW_UPS, TWO_HOUSEHOLDS } from './fixtures'

afterEach(() => vi.unstubAllGlobals())

const modules = () => [fakeModule('alpha')]
const ASK = { name: 'Ask the assistant' }

async function shellReady() {
  await screen.findByRole('navigation', { name: 'Workspace' })
}

async function openFromHeader(user: ReturnType<typeof renderDemo>['user']) {
  await shellReady()
  await user.click(screen.getByRole('button', ASK))
  return screen.findByRole('dialog', { name: 'Trove Assistant' })
}

async function paletteLabels(user: ReturnType<typeof renderDemo>['user']) {
  await user.keyboard('{Control>}k{/Control}')
  const palette = await screen.findByRole('dialog', { name: 'Search the workspace' })
  const labels = within(palette)
    .getAllByRole('option')
    .map((option) => option.textContent ?? '')
  await user.keyboard('{Escape}')
  return labels.join('|')
}

/** One JSON-RPC answer per call: `answer(toolName, args)` gives the structuredContent or a Response. */
function mcpHandler(answer: (tool: string, args: Record<string, unknown>) => unknown): {
  handler: Handler
  calls: { tool: string; args: Record<string, unknown>; auth: string | null }[]
} {
  const calls: { tool: string; args: Record<string, unknown>; auth: string | null }[] = []
  const handler: Handler = (url, init) => {
    if (!url.pathname.endsWith('/api/mcp/mcp') || init?.method !== 'POST') return undefined
    const body = JSON.parse(init.body as string) as {
      id: number
      params: { name: string; arguments: Record<string, unknown> }
    }
    calls.push({ tool: body.params.name, args: body.params.arguments, auth: authHeader(init) })
    const out = answer(body.params.name, body.params.arguments)
    if (out instanceof Response) return out
    return json({
      jsonrpc: '2.0',
      id: body.id,
      result: { content: [{ type: 'text', text: '' }], isError: false, structuredContent: out },
    })
  }
  return { handler, calls }
}

describe('who sees the assistant', () => {
  it.each<Persona>(['MEMBER', 'AUDITOR'])(
    '%s sees no button and no palette entry',
    async (persona) => {
      const { user } = renderDemo(persona, { modules: modules() })
      await shellReady()
      expect(screen.queryByRole('button', ASK)).not.toBeInTheDocument()
      expect(await paletteLabels(user)).not.toContain('Ask the assistant')
      expect(screen.queryByText(/Trove Assistant/)).not.toBeInTheDocument()
    },
  )

  it.each<Persona>(['DEVELOPER', 'ADMIN', 'OWNER'])(
    '%s gets the button and the palette entry',
    async (persona) => {
      const { user } = renderDemo(persona, { modules: modules() })
      await shellReady()
      expect(screen.getByRole('button', ASK)).toBeInTheDocument()
      expect(await paletteLabels(user)).toContain('Ask the assistant')
    },
  )

  it('follows the live session: no mcp:use, no assistant', async () => {
    renderLive({
      persona: 'OWNER',
      me: () => ({
        id: 'me-1',
        email: 'a@example.test',
        displayName: 'Ada',
        roles: ['OWNER'],
        permissions: ['products:use'],
        plan: 'FREE',
      }),
      modules: modules(),
    })
    await shellReady()
    expect(screen.queryByRole('button', ASK)).not.toBeInTheDocument()
  })
})

describe('opening and closing', () => {
  it('opens from the header button with focus in the question box; Escape closes and returns focus', async () => {
    const { user } = renderDemo('OWNER', { modules: modules() })
    const dialog = await openFromHeader(user)
    expect(within(dialog).getByRole('textbox', { name: 'Your question' })).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', ASK)).toHaveFocus()
  })

  it('opens from the command palette', async () => {
    const { user } = renderDemo('DEVELOPER', { modules: modules() })
    await shellReady()
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog', { name: 'Search the workspace' })
    await user.keyboard('ask the assistant')
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'Trove Assistant' })
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Your question' })).toHaveFocus(),
    )
  })

  it('says it is not an AI model and asks for a question when the box is empty', async () => {
    const { user } = renderDemo('OWNER', { modules: modules() })
    const dialog = await openFromHeader(user)
    expect(dialog).toHaveAccessibleDescription(/not from an AI model/)
    await user.click(within(dialog).getByRole('button', { name: 'Ask' }))
    expect(within(dialog).getByText('Type a question first.')).toBeInTheDocument()
  })
})

describe('live: through the MCP server', () => {
  it("asks the routed tool with the person's token, names the tool's product and says it is audited", async () => {
    const mcp = mcpHandler(() => FOLLOW_UPS)
    const { user } = renderLive({ persona: 'OWNER', modules: modules(), handler: mcp.handler })
    const dialog = await openFromHeader(user)
    expect(
      within(dialog).getByText('Each question is recorded in your audit log.'),
    ).toBeInTheDocument()

    await user.type(
      within(dialog).getByRole('textbox', { name: 'Your question' }),
      'What am I waiting on?{Enter}',
    )
    expect(await within(dialog).findByText("You're waiting on 2 things.")).toBeInTheDocument()
    expect(within(dialog).getByText('From Waiting On')).toBeInTheDocument()
    expect(mcp.calls).toEqual([
      { tool: 'waiting_on_list_followups', args: {}, auth: 'Bearer token-user-a' },
    ])

    // A link into the product closes the panel and goes there.
    await user.click(within(dialog).getByRole('link', { name: 'Refund for returned jacket' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(window.location.pathname).toBe('/app/waiting-on/items/item-1')
  })

  it('asks which household, then asks the tool for that one', async () => {
    const mcp = mcpHandler((_tool, args) =>
      args.householdId
        ? {
            ...TWO_HOUSEHOLDS,
            count: 1,
            households: TWO_HOUSEHOLDS.households.filter((h) => h.id === args.householdId),
          }
        : TWO_HOUSEHOLDS,
    )
    const { user } = renderLive({ persona: 'OWNER', modules: modules(), handler: mcp.handler })
    const dialog = await openFromHeader(user)
    await user.click(within(dialog).getByRole('button', { name: 'What is our household balance?' }))
    const group = await within(dialog).findByRole('group', { name: 'Choose a household' })
    await user.click(within(group).getByRole('button', { name: 'Lake house' }))
    expect(await within(dialog).findByText('$120.50')).toBeInTheDocument()
    expect(mcp.calls.map((call) => call.args)).toEqual([{}, { householdId: 'hh-2' }])
  })

  it('shows failures as sentences and keeps working', async () => {
    let failure: Response | null = new Response(JSON.stringify({ status: 503, title: 'Down' }), {
      status: 503,
      headers: { 'content-type': 'application/problem+json' },
    })
    const mcp = mcpHandler((tool) => {
      if (failure) {
        const out = failure
        failure = null
        return out
      }
      if (tool === 'home_pulse_appliance_status') {
        return json({
          jsonrpc: '2.0',
          id: 1,
          result: {
            isError: true,
            structuredContent: { error: { code: 'forbidden', message: 'x' } },
          },
        })
      }
      return { query: 'zebra', passages: [], count: 0 }
    })
    const { user } = renderLive({ persona: 'OWNER', modules: modules(), handler: mcp.handler })
    const dialog = await openFromHeader(user)
    const box = within(dialog).getByRole('textbox', { name: 'Your question' })

    await user.type(box, 'zebra{Enter}')
    expect(await within(dialog).findByText(/can't reach My-Trove right now/)).toBeInTheDocument()

    await user.type(box, 'any alerts?{Enter}')
    expect(
      await within(dialog).findByText(/You don't have permission to read Home Pulse/),
    ).toBeInTheDocument()

    await user.type(box, 'zebra{Enter}')
    expect(
      await within(dialog).findByText(/Nothing in your notes, documents or receipts/),
    ).toBeInTheDocument()
    // The page behind the (modal) panel is still there.
    expect(screen.getByRole('navigation', { name: 'Workspace', hidden: true })).toBeInTheDocument()
  })

  it('reads a 403 from the gateway as the account not being allowed', async () => {
    const mcp = mcpHandler(
      () =>
        new Response(JSON.stringify({ status: 403, title: 'Forbidden' }), {
          status: 403,
          headers: { 'content-type': 'application/problem+json' },
        }),
    )
    const { user } = renderLive({ persona: 'OWNER', modules: modules(), handler: mcp.handler })
    const dialog = await openFromHeader(user)
    await user.click(within(dialog).getByRole('button', { name: 'Is the fridge OK?' }))
    expect(
      await within(dialog).findByText(/isn't allowed to use the assistant/),
    ).toBeInTheDocument()
  })
})

describe('demo mode', () => {
  it('answers every tool from the products mock APIs and makes no network call', async () => {
    const network = vi.fn(() => Promise.reject(new Error('demo mode must not use the network')))
    vi.stubGlobal('fetch', network)
    const { user } = renderDemo('OWNER', {
      modules: [waitingOn, askYourLife, homePulse, familyTreasury],
    })
    const dialog = await openFromHeader(user)
    expect(within(dialog).getByText(/Nothing is sent or recorded/)).toBeInTheDocument()
    const box = within(dialog).getByRole('textbox', { name: 'Your question' })

    const answers = () => within(dialog).getByRole('list', { name: 'Answers' })
    await user.type(box, 'What am I waiting on?{Enter}')
    await within(answers()).findByText(/You're waiting on \d+ things?\./, {}, { timeout: 5000 })

    await user.type(box, 'How are my appliances?{Enter}')
    await within(answers()).findByText(
      /appliances? (look fine|needs? attention)|looks fine/,
      {},
      { timeout: 5000 },
    )

    await user.type(box, 'household balance{Enter}')
    // The demo person belongs to more than one household, so the assistant asks which.
    const group = await within(answers()).findByRole(
      'group',
      { name: 'Choose a household' },
      { timeout: 5000 },
    )
    await user.click(within(group).getAllByRole('button')[0] as HTMLElement)
    await within(answers()).findByText(/^Balances for/, {}, { timeout: 5000 })

    await user.type(box, 'When is my dentist appointment?{Enter}')
    await within(answers()).findByText('The best match in your documents:', {}, { timeout: 5000 })
    expect(within(answers()).getByRole('blockquote')).toBeInTheDocument()

    for (const product of ['Waiting On', 'Home Pulse', 'Family Treasury', 'Ask Your Life']) {
      expect(within(answers()).getAllByText(`From ${product}`).length).toBeGreaterThan(0)
    }
    expect(network).not.toHaveBeenCalled()
  }, 20_000)
})

it('never calls the MCP server for a member', async () => {
  const { fetchMock } = renderLive({ persona: 'MEMBER', modules: modules() })
  await shellReady()
  expect(
    fetchMock.mock.calls.map(([input]) => urlOf(input)).some((url) => url.includes('/mcp/')),
  ).toBe(false)
})
