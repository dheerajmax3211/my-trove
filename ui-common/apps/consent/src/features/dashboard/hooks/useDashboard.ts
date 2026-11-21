import { useApiQuery } from '@platform/api-client'
import { paths } from '../../../shared/api/paths'
import type { Dashboard } from '../../../shared/api/types'

export function useDashboard() {
  return useApiQuery<Dashboard>(paths.dashboard)
}
