import { useMemo } from 'react'
import { useAlerts } from '../alerts/hooks'
import { useAppliances } from '../appliances/hooks'
import { buildTodayItems } from './todayItems'

/**
 * The "Today" feed for the workspace home. Runs inside this module's providers, so it uses this module's API
 * client and query cache (the same entries the Home page reads, so opening the module costs no extra request).
 */
export function useTodayItems() {
  const alerts = useAlerts('OPEN')
  const appliances = useAppliances()
  const alertData = alerts.data
  const applianceData = appliances.data
  const loading = alerts.isPending || appliances.isPending

  const items = useMemo(
    () => buildTodayItems(alertData ?? [], applianceData ?? []),
    [alertData, applianceData],
  )
  return { items, loading }
}
