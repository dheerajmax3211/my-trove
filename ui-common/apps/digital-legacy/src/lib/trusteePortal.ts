/**
 * Where trustees open their invite. The trustee portal is a feature of the standalone Digital Legacy
 * app, not of the workspace module, so a workspace deployment sets `VITE_TRUSTEE_PORTAL_URL` to the
 * standalone app's origin. Without it the invite points at the page's own origin (standalone use).
 */
export function trusteePortalOrigin(
  env: Record<string, string | boolean | undefined> = import.meta.env,
  fallback: string = window.location.origin,
): string {
  const configured = env.VITE_TRUSTEE_PORTAL_URL
  const value = typeof configured === 'string' ? configured.trim() : ''
  return (value || fallback).replace(/\/+$/, '')
}
