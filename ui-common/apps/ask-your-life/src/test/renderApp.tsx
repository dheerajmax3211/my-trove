import { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../App'
import type { MockApiOptions } from '../mock/mockApi'
import { createDemoRuntime } from '../runtime'

export interface RenderOptions {
  route?: string
  mock?: MockApiOptions
  wrapFetch?: (mockFetch: typeof fetch) => typeof fetch
  signedIn?: boolean
  /** Forwarded to user-event, e.g. `{ applyAccept: false }` to upload a type the picker filters out. */
  userOptions?: Parameters<typeof userEvent.setup>[0]
}

/** Renders the whole app against the in-memory API: no latency, fast polling, no query retries. */
export function renderApp({
  route = '/',
  mock,
  wrapFetch,
  signedIn,
  userOptions,
}: RenderOptions = {}) {
  // Recent searches live in localStorage; every test starts with none.
  window.localStorage.clear()
  const runtime = createDemoRuntime({
    mock: { latencyMs: 0, ...mock },
    ...(wrapFetch ? { wrapFetch } : {}),
    ...(signedIn === undefined ? {} : { signedIn }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
  })
  const user = userEvent.setup(userOptions)
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <App runtime={runtime} settings={{ pollIntervalMs: 10 }} queryClient={queryClient} />
    </MemoryRouter>,
  )
  return { runtime, user, queryClient, ...utils }
}

export const searchBox = () =>
  screen.getByRole('searchbox', { name: /search your notes, documents and receipts/i })

/** Resolves once the signed-in shell has rendered. */
export const appReady = () => screen.findByRole('navigation', { name: 'Main' })

export async function runSearch(user: ReturnType<typeof userEvent.setup>, query: string) {
  const box = searchBox()
  await user.clear(box)
  await user.type(box, query)
  await user.click(screen.getByRole('button', { name: 'Search' }))
}
