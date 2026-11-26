/**
 * Where trustees open their invite: the workspace's public `/trustee` portal. Without
 * `VITE_TRUSTEE_PORTAL_URL` the invite points at the page's own origin (the workspace itself).
 */
export function trusteePortalOrigin(
  env: Record<string, string | boolean | undefined> = import.meta.env,
  fallback: string = window.location.origin,
): string {
  const configured = env.VITE_TRUSTEE_PORTAL_URL
  const value = typeof configured === 'string' ? configured.trim() : ''
  return (value || fallback).replace(/\/+$/, '')
}
