import { createApiClient } from '@platform/api-client'
import { DEMO_USER, createStubAuthClient } from '@platform/auth-web'
import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../App'
import { createMockApi, type MockApi, type MockApiOptions } from '../mock/mockApi'
import type { Runtime } from '../runtime'

// Pin the zone so formatted times are the same on every machine.
process.env.TZ = 'UTC'

/** The instant every UI test lives at. */
export const NOW = new Date('2026-11-19T12:00:00.000Z')
export const clock = () => new Date(NOW)

export interface Harness {
  mock: MockApi
  runtime: Runtime
  user: ReturnType<typeof userEvent.setup>
}

export interface HarnessOptions {
  path?: string
  seed?: MockApiOptions['seed']
  signedIn?: boolean
  /** Requests wait for this promise, so a test can look at the loading state. */
  gate?: Promise<void>
}

/** Renders the whole app against the in-memory mock API, signed in, at a fixed time. */
export async function renderApp({
  path = '/',
  seed = 'demo',
  signedIn = true,
  gate,
}: HarnessOptions = {}): Promise<Harness> {
  const mock = createMockApi({ clock, seed })
  const stub = createStubAuthClient({ initialUser: signedIn ? DEMO_USER : null })
  const runtime: Runtime = {
    mode: 'demo',
    authClient: stub,
    stub,
    apiClient: createApiClient({
      baseUrl: '/api',
      getToken: (force) => stub.getIdToken(force),
      fetch: gate
        ? async (input, init) => {
            await gate
            return mock.fetch(input, init)
          }
        : mock.fetch,
    }),
    clock,
    ingestBaseUrl: 'https://hp.example.test',
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <App runtime={runtime} queryClient={queryClient} />
    </MemoryRouter>,
  )
  if (signedIn) await screen.findByRole('main')
  return { mock, runtime, user }
}

/** The card of one appliance on the overview, found by its heading. */
export async function applianceCard(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 2, name })
  const card = heading.closest<HTMLElement>('.link-card')
  if (!card) throw new Error(`No card for ${name}`)
  return card
}

export const inMain = () => within(screen.getByRole('main'))
