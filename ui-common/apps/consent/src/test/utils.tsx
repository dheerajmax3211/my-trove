import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../App'
import { createMockBackend, type MockBackend } from '../mock/backend'
import { createRuntime, type Runtime } from '../runtime'

export interface RenderOptions {
  route?: string
  backend?: MockBackend
  seed?: 'demo' | 'empty'
  signedIn?: boolean
}

/** Renders the whole app against the in-memory mock gateway. No latency, no retries: deterministic. */
export function renderApp({
  route = '/',
  backend,
  seed = 'demo',
  signedIn = true,
}: RenderOptions = {}) {
  const gateway = backend ?? createMockBackend({ seed })
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
  const runtime: Runtime = createRuntime(
    { VITE_USE_MOCK: 'true' },
    { signedIn, latencyMs: 0, backend: gateway, queryClient },
  )
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[route]}>
      <App runtime={runtime} />
    </MemoryRouter>,
  )
  return { user, backend: gateway, runtime }
}

/** The page's single h1, once it has rendered. */
export const pageHeading = (name: string) => screen.findByRole('heading', { level: 1, name })

export const dialog = () => within(screen.getByRole('dialog'))

export const callsTo = (backend: MockBackend, method: string, pathPart: string) =>
  backend.calls.filter((c) => c.method === method && c.path.includes(pathPart))
