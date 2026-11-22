/**
 * The routes an API key may call, as the gateway's `gateway.api-key-routes` lists them. The console uses this to refuse
 * a request before it is sent; the gateway still decides for real.
 */
export interface KeyRoute {
  method: 'GET'
  path: string
  /** The permission the route needs. A key's scopes must grant it (the scope catalogue says which). */
  permission: string
}

export const KEY_ROUTES: readonly KeyRoute[] = [
  { method: 'GET', path: '/platform/v1/usage/me', permission: 'usage:read:self' },
]

/** The gateway's own refusal text for a route no key may call. */
export const NOT_OPEN_TO_KEYS =
  'API keys cannot call this route. Only the routes listed for keys are open to them.'

/** The gateway's own refusal text for a route whose permission the key does not hold. */
export function lacksPermission(permission: string): string {
  return `This API key lacks the permission '${permission}' that this route requires.`
}
