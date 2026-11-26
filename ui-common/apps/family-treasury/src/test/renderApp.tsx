import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { PERSONAS } from '../mock/seed'
import type { MockBackend } from '../mock/mockBackend'
import { renderModule } from './renderModule'
import type { Clock } from './fixtures'

export interface RenderOptions {
  /** Who is signed in. Default Maya (owner). */
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

let current: ReturnType<typeof renderModule> | null = null

/** Mounts the module at the root against the in-memory mock, deterministic clock, no latency, no retries. */
export function renderApp(options: RenderOptions = {}) {
  const { path = '', ...rest } = options
  current = renderModule({
    ...rest,
    mounted: false,
    path: (id) => (path.startsWith('/') ? path : `/h/${id}${path ? `/${path}` : ''}`),
  })
  return current
}

export const main = () => screen.getByRole('main')

/** Waits for the household shell to be up (the page heading). */
export async function waitForHeading(name: string | RegExp, level = 1) {
  return screen.findByRole('heading', { level, name })
}

/** Signs in as another household member, by display name (the workspace session would change the same way). */
export async function switchPersona(_user: UserEvent, name: string) {
  const persona = PERSONAS.find((p) => p.name === name)
  if (!persona || !current) throw new Error(`no persona ${name}`)
  await current.switchTo(persona.uid)
}

export { screen, waitFor, within }

const labelPattern = (label: string) =>
  new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?$`)

/** A form control by its label. Required fields carry a decorative `*` in their label text; this ignores it. */
export const getField = (label: string) => screen.getByLabelText(labelPattern(label))
export const findField = (label: string) => screen.findByLabelText(labelPattern(label))
