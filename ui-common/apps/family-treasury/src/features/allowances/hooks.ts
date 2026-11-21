import { treasuryKeys } from '../../api/keys'
import { useTreasuryQuery } from '../../api/hooks'

export function useSchedules(householdId: string, enabled = true) {
  return useTreasuryQuery(
    treasuryKeys.schedules(householdId),
    (api) => api.listSchedules(householdId),
    {
      enabled,
    },
  )
}

export function useRuns(householdId: string, scheduleId: string) {
  return useTreasuryQuery(treasuryKeys.runs(householdId, scheduleId), (api) =>
    api.listRuns(householdId, scheduleId),
  )
}
