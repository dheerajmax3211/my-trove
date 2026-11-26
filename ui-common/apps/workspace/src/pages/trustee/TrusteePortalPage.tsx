import { TrusteePortal } from '@platform/digital-legacy/trustee'
import type { ProductModule } from '@platform/workspace-kit'
import { notFoundDemoFetch } from '../../demo/workspaceDemo'
import { usePageTitle } from '../../lib/usePageTitle'
import type { Runtime } from '../../runtime'

const SERVICE = 'digital-legacy'

/**
 * Digital Legacy's trustee portal at `/trustee/*`, where invite links point. Trustees have no My-Trove
 * account, so this sits outside the sign-in gate and never uses the workspace session; the portal has its
 * own API client that sends `Authorization: Trustee <token>`. In demo mode it shares the Digital Legacy
 * module's in-memory backend, so one tab can play both the owner and a trustee.
 */
export function TrusteePortalPage({
  runtime,
  modules,
}: {
  runtime: Runtime
  modules: readonly ProductModule[]
}) {
  usePageTitle('Trustee portal')
  const legacy = modules.find((m) => m.service === SERVICE)
  const transport = legacy
    ? runtime.moduleFetch(legacy)
    : runtime.mode === 'demo'
      ? notFoundDemoFetch
      : runtime.workspaceFetch
  return (
    <TrusteePortal
      apiBaseUrl={`${runtime.apiBase}/${SERVICE}`}
      {...(transport ? { fetch: transport } : {})}
    />
  )
}
