/** The gateway route of this service in local development (`dev/up.sh`); the same default the workspace uses. */
export const DEV_INGEST_BASE_URL = 'http://localhost:8080/api/home-pulse'

/**
 * Where a device should send readings: the gateway route for this service (`VITE_API_BASE_URL` is `<gateway>/api`,
 * the workspace's own setting), falling back to the local development gateway.
 */
export function useIngestBaseUrl(): string {
  const configured = (import.meta.env as Record<string, string | boolean | undefined>)
    .VITE_API_BASE_URL
  return gatewayIngestBaseUrl(configured)
}

/** `<gateway>/api/home-pulse`: the configured gateway, or the local development gateway when none is set. */
export function gatewayIngestBaseUrl(configured: string | boolean | undefined): string {
  const base =
    typeof configured === 'string' && configured.trim() !== ''
      ? configured.trim().replace(/\/+$/, '')
      : 'http://localhost:8080/api'
  return `${base}/home-pulse`
}
