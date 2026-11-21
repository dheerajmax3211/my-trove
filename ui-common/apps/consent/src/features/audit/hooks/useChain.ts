import { useApiQuery } from '@platform/api-client'
import { paths } from '../../../shared/api/paths'
import type { ChainReport } from '../../../shared/api/types'

/**
 * Walks the owner's audit chain. With `autoRun` false nothing is fetched until `refetch()` is called,
 * so the Audit screen only verifies when asked while the dashboard can show health at a glance.
 */
export function useChainVerification({ autoRun }: { autoRun: boolean }) {
  return useApiQuery<ChainReport>(paths.verify, { enabled: autoRun, staleTime: 0 })
}
