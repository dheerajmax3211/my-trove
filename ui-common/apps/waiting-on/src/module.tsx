import { HourglassIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'
import type { ReactNode } from 'react'
import { ClockProvider, systemClock } from './lib/clock'
import { createMockBackend } from './mock/backend'
import { demoSeed } from './mock/seed'
import { NAV } from './navigation'
import { WaitingOnRoutes } from './routes'
import { useTodayItems } from './today'

/** The product's own context: "now". The workspace supplies auth, the API client, the query cache, theme and toasts. */
function Providers({ children }: { children: ReactNode }) {
  return <ClockProvider clock={systemClock}>{children}</ClockProvider>
}

/**
 * The mock service speaks `/api/v1/...`; inside the workspace the client calls `<gateway>/api/waiting-on/v1/...`
 * with whatever token the demo identity sends. Rewrite the path and make sure there is a token.
 */
export function createDemoFetch(): typeof fetch {
  const backend = createMockBackend({
    clock: systemClock,
    latencyMs: 150,
    seed: demoSeed(systemClock()),
  })
  return (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, 'http://localhost')
    url.pathname = url.pathname.replace(/^\/api\/waiting-on(?=\/|$)/, '/api')
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    )
    if (!headers.get('authorization')) headers.set('authorization', 'Bearer demo')
    return backend.fetch(url.pathname + url.search, { ...init, headers })
  }
}

/** What Waiting On exposes to the workspace (plan task 2.6). */
export const productModule: ProductModule = {
  id: 'waiting-on',
  service: 'waiting-on',
  title: 'Waiting On',
  tagline: 'Follow up on refunds, claims and approvals until they are settled.',
  description:
    'Track what you are owed, let a follow-up schedule chase it, and keep a draft letter ready for each step.',
  accent: 'var(--pp-color-product-waiting-on)',
  icon: HourglassIcon,
  nav: NAV,
  Providers,
  Routes: WaitingOnRoutes,
  useTodayItems,
  createDemoFetch,
}
