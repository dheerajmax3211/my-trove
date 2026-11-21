import { useApiQuery } from '@platform/api-client'
import { sharedPaths } from '../../api/paths'
import type { AuditEvent, Page } from './types'

export interface AuditQuery {
  /** `undefined` = the caller's personal events. */
  householdId?: string
  action?: string
  page?: number
  size?: number
}

export function useAudit({ householdId, action, page = 0, size = 20 }: AuditQuery) {
  return useApiQuery<Page<AuditEvent>>(sharedPaths.audit, {
    query: {
      ...(householdId ? { householdId } : {}),
      ...(action ? { action } : {}),
      page,
      size,
    },
  })
}
