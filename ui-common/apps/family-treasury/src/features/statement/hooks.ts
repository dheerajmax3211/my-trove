import { treasuryKeys } from '../../api/keys'
import { useTreasuryQuery } from '../../api/hooks'
import type { StatementQuery } from '../../api/types'

export function useStatement(householdId: string, accountId: string, q: StatementQuery) {
  return useTreasuryQuery(
    treasuryKeys.statement(householdId, accountId, q),
    (api) => api.statement(householdId, accountId, q),
    { enabled: accountId !== '' },
  )
}
