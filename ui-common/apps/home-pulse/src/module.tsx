import { productVar } from '@platform/tokens'
import { BellIcon, ClockIcon, HomeIcon, PulseHomeIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'
import type { ReactNode } from 'react'
import { useTodayItems } from './features/today/useTodayItems'
import { ClockProvider, systemClock } from './lib/clock'
import { PlugIcon } from './lib/icons'
import { createMockApi } from './mock/mockApi'
import { HomePulseRoutes } from './routes'

/** App-specific context. The workspace supplies auth, the API client, the query cache, theme, toasts and the router. */
function HomePulseProviders({ children }: { children: ReactNode }) {
  return <ClockProvider clock={systemClock}>{children}</ClockProvider>
}

/** The navigation, shared by the workspace sidebar and the standalone app's own sidebar. */
export const HOME_PULSE_NAV: ProductModule['nav'] = [
  { to: '/', label: 'Home', end: true, icon: HomeIcon },
  { to: '/alerts', label: 'Alerts', icon: BellIcon },
  { to: '/devices', label: 'Devices', icon: PlugIcon },
  { to: '/reminders', label: 'Reminders', icon: ClockIcon },
]

/** What Home Pulse exposes to the workspace (plan task 2.6). */
export const productModule: ProductModule = {
  id: 'home-pulse',
  service: 'home-pulse',
  title: 'Home Pulse',
  tagline: 'Know when an appliance is about to fail.',
  description:
    'Smart plugs report how much power each appliance draws. Home Pulse learns what normal looks like, then tells you in plain words when a fridge, pump or air conditioner drifts away from it.',
  accent: productVar('home-pulse'),
  icon: PulseHomeIcon,
  nav: HOME_PULSE_NAV,
  Providers: HomePulseProviders,
  Routes: HomePulseRoutes,
  useTodayItems,
  createDemoFetch: () => createMockApi({ clock: systemClock, latencyMs: 150 }).fetch,
}
