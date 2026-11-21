import { useApiQuery } from '@platform/api-client'
import { paths } from '../../../shared/api/paths'
import type { AuditEntry } from '../../../shared/api/types'

export interface AccessLogQuery {
  limit: number
  /** Exclusive upper bound on `seq`: pages backwards through history. */
  beforeSeq?: number
  clientId?: string
}

export function useAccessLog({ limit, beforeSeq, clientId }: AccessLogQuery) {
  return useApiQuery<AuditEntry[]>(paths.accessLog, {
    query: { limit, beforeSeq, clientId },
  })
}
