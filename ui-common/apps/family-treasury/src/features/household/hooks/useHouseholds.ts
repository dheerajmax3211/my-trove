import { treasuryKeys } from '../../../api/keys'
import { useTreasuryQuery } from '../../../api/hooks'

export function useHouseholds() {
  return useTreasuryQuery(treasuryKeys.households(), (api) => api.listHouseholds())
}

export function useHouseholdDetail(id: string) {
  return useTreasuryQuery(treasuryKeys.detail(id), (api) => api.getHousehold(id))
}
