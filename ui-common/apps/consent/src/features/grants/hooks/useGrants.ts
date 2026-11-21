import { useApiMutation, useApiQuery } from '@platform/api-client'
import { afterDecision, paths } from '../../../shared/api/paths'
import type { Grant } from '../../../shared/api/types'

export function useGrants(includeInactive: boolean) {
  return useApiQuery<Grant[]>(paths.grants, { query: { includeInactive } })
}

/** Variable: the grant id. */
export function useRevokeGrant() {
  return useApiMutation<Grant, string>({
    path: (id) => paths.revoke(id),
    body: () => undefined,
    invalidate: afterDecision,
  })
}
