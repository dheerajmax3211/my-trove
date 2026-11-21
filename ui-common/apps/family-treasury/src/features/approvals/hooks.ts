import { treasuryKeys } from '../../api/keys'
import { useTreasuryQuery } from '../../api/hooks'

export const PENDING = 'PENDING_APPROVAL'

/** `status` null = every request. */
export function useApprovals(householdId: string, status: string | null) {
  return useTreasuryQuery(treasuryKeys.approvals(householdId, status), (api) =>
    api.listApprovals(householdId, status ?? undefined),
  )
}
