import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import { App } from '../App'
import { MockBackend } from '../mock/backend'
import { createRuntime, type Runtime } from '../runtime'

export interface Download {
  name: string
  text: string
}

/** jsdom has no downloads or object URLs: capture what the app would save, so tests can reuse it. */
export function setupBrowserStubs(): { downloads: Download[] } {
  const state = { downloads: [] as Download[] }
  const blobs = new Map<string, Blob>()
  let counter = 0
  beforeEach(() => {
    state.downloads = []
    blobs.clear()
    localStorage.clear()
    URL.createObjectURL = vi.fn((blob: Blob) => {
      counter += 1
      const url = `blob:test/${counter}`
      blobs.set(url, blob)
      return url
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      const blob = blobs.get(this.href)
      if (!blob) return
      const reader = new FileReader()
      const name = this.download
      reader.onload = () =>
        state.downloads.push({ name, text: typeof reader.result === 'string' ? reader.result : '' })
      reader.readAsText(blob)
    })
  })
  afterEach(() => {
    localStorage.clear()
  })
  return state
}

export interface Rendered {
  runtime: Runtime
  mock: MockBackend
  user: ReturnType<typeof userEvent.setup>
}

/** Renders the whole app at `route`, signed in as the demo owner unless `signedIn` is false. */
export function renderApp(
  route = '/',
  options: { mock?: MockBackend; signedIn?: boolean } = {},
): Rendered & ReturnType<typeof render> {
  const mock = options.mock ?? new MockBackend()
  const runtime = createRuntime({ env: {}, latencyMs: 0, signedIn: options.signedIn ?? true, mock })
  const user = userEvent.setup()
  const view = render(
    <MemoryRouter initialEntries={[route]}>
      <App runtime={runtime} />
    </MemoryRouter>,
  )
  return { ...view, runtime, mock, user }
}
