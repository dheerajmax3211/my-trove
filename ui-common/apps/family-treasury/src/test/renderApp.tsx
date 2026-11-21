import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from '../App'
import { introKey } from '../features/household/components/FirstUseNotice'
import { DEMO_HOUSEHOLD, PERSONAS } from '../mock/seed'
import type { MockBackend } from '../mock/mockBackend'
import { createDemoRuntime, type Runtime } from '../runtime'
import { fixedClock, type Clock } from './fixtures'

export interface RenderOptions {
  /** Who is signed in. `null` shows the sign-in screen. Default Maya (owner). */
  uid?: string | null
  /** Route to open, relative to the Okafor household unless it starts with "/". Default: dashboard. */
  path?: string
  /** Show the first-use notice instead of pre-dismissing it. */
  firstUse?: boolean
  clock?: Clock
  /** Start with an empty mock (no households). Default: the seeded Okafor family. */
  seed?: boolean
  /** Prepare the backend (extra entries, drift...) before the UI loads. */
  prepare?: (backend: MockBackend, householdId: string) => void
}

export interface Rendered {
  user: UserEvent
  backend: MockBackend
  runtime: Runtime
  householdId: string
  clock: Clock
  queryClient: QueryClient
}

/** Boots the whole app against the in-memory mock, deterministic clock, no latency, no retries. */
export function renderApp(options: RenderOptions = {}): Rendered {
  const { uid = 'u-maya', path = '', firstUse = false, seed = true, prepare } = options
  const clock = options.clock ?? fixedClock()
  window.localStorage.clear()
  if (!firstUse) for (const p of PERSONAS) window.localStorage.setItem(introKey(p.uid), 'yes')

  const runtime = createDemoRuntime({ initialUid: uid, now: clock.now, seed })
  const backend = runtime.demo!.backend
  const householdId = seed ? backend.householdByName(DEMO_HOUSEHOLD).id : ''
  prepare?.(backend, householdId)

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
  const route = path.startsWith('/') ? path : `/h/${householdId}${path ? `/${path}` : ''}`
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[route]}>
      <App runtime={runtime} queryClient={queryClient} themeStorageKey={null} />
    </MemoryRouter>,
  )
  return { user, backend, runtime, householdId, clock, queryClient }
}

export const main = () => screen.getByRole('main')

/** Waits for the household shell to be up (the page heading). */
export async function waitForHeading(name: string | RegExp, level = 1) {
  return screen.findByRole('heading', { level, name })
}

export async function switchPersona(user: UserEvent, name: string) {
  await user.selectOptions(screen.getByRole('combobox', { name: 'Acting as' }), name)
}

export { screen, waitFor, within }

const labelPattern = (label: string) =>
  new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?$`)

/** A form control by its label. Required fields carry a decorative `*` in their label text; this ignores it. */
export const getField = (label: string) => screen.getByLabelText(labelPattern(label))
export const findField = (label: string) => screen.findByLabelText(labelPattern(label))
