/** The product apps the launcher links to. URLs come from `VITE_APP_URL_<NAME>`. */
export interface LauncherApp {
  id: string
  name: string
  description: string
  envKey: string
  defaultUrl: string
}

export const LAUNCHER_APPS: readonly LauncherApp[] = [
  {
    id: 'waiting-on',
    name: 'Waiting On',
    description: 'Follow up on refunds, claims and approvals until they are settled.',
    envKey: 'VITE_APP_URL_WAITING_ON',
    defaultUrl: 'http://localhost:5182',
  },
  {
    id: 'consent',
    name: 'Consent',
    description: 'Decide who can read which part of your data, and take it back any time.',
    envKey: 'VITE_APP_URL_CONSENT',
    defaultUrl: 'http://localhost:5183',
  },
  {
    id: 'home-pulse',
    name: 'Home Pulse',
    description: 'Watch your appliances and get a nudge when something looks off.',
    envKey: 'VITE_APP_URL_HOME_PULSE',
    defaultUrl: 'http://localhost:5184',
  },
  {
    id: 'ask-your-life',
    name: 'Ask Your Life',
    description: 'Search everything you have saved, privately.',
    envKey: 'VITE_APP_URL_ASK_YOUR_LIFE',
    defaultUrl: 'http://localhost:5185',
  },
  {
    id: 'digital-legacy',
    name: 'Digital Legacy',
    description: 'Plan what the people you trust can open if you are no longer around.',
    envKey: 'VITE_APP_URL_DIGITAL_LEGACY',
    defaultUrl: 'http://localhost:5186',
  },
  {
    id: 'family-treasury',
    name: 'Family Treasury',
    description: 'Keep the household ledger, approvals and allowances in one place.',
    envKey: 'VITE_APP_URL_FAMILY_TREASURY',
    defaultUrl: 'http://localhost:5187',
  },
]

type Env = Record<string, string | boolean | undefined>

const isWebUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export interface ResolvedApp extends LauncherApp {
  url: string
}

/** Env override when it is a valid http(s) URL, otherwise the localhost default. */
export function resolveLauncherApps(env: Env): ResolvedApp[] {
  return LAUNCHER_APPS.map((app) => {
    const value = env[app.envKey]
    const override = typeof value === 'string' ? value.trim() : ''
    return { ...app, url: override && isWebUrl(override) ? override : app.defaultUrl }
  })
}
