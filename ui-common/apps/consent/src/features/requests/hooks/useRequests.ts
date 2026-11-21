import { useApiMutation, useApiQuery } from '@platform/api-client'
import { afterDecision, paths } from '../../../shared/api/paths'
import type { AccessRequest, ApproveBody, DenyBody, Grant } from '../../../shared/api/types'

/** Pending requests (the inbox). */
export function usePendingRequests() {
  return useApiQuery<AccessRequest[]>(paths.requests, { query: { status: 'PENDING' } })
}

/** Every request, newest first: used for the decided/expired history. */
export function useAllRequests(enabled: boolean) {
  return useApiQuery<AccessRequest[]>(paths.requests, { enabled })
}

export function useApproveRequest() {
  return useApiMutation<Grant, { id: string; body: ApproveBody }>({
    path: (v) => paths.approve(v.id),
    body: (v) => v.body,
    invalidate: afterDecision,
  })
}

export function useDenyRequest() {
  return useApiMutation<AccessRequest, { id: string; body: DenyBody }>({
    path: (v) => paths.deny(v.id),
    body: (v) => v.body,
    invalidate: afterDecision,
  })
}
