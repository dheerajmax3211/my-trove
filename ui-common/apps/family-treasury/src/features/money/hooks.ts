import { treasuryKeys } from '../../api/keys'
import { useTreasuryQuery } from '../../api/hooks'

export function useEntries(householdId: string, page: number, size: number, enabled = true) {
  return useTreasuryQuery(
    treasuryKeys.entries(householdId, page, size),
    (api) => api.listEntries(householdId, page, size),
    { enabled },
  )
}
