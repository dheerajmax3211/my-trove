import { useMemo } from 'react'
import { useClock } from '../../lib/clock'
import { useAlerts } from '../alerts/hooks'
import { useAppliances } from '../appliances/hooks'
import { buildTodayItems } from './todayItems'

/**
 * The "Today" feed for the workspace home. Runs inside this module's providers, so it uses this module's API
 * client and query cache (the same entries the Home page reads, so opening the module costs no extra request).
 */
export function useTodayItems() {
  const clock = useClock()
  const alerts = useAlerts('OPEN')
  const appliances = useAppliances()
  const alertData = alerts.data
  const applianceData = appliances.data
  const loading = alerts.isPending || appliances.isPending

  const items = useMemo(
    () => buildTodayItems(alertData ?? [], applianceData ?? [], clock()),
    // The clock is read once per data change; a day passing without new data is covered by the 60 s alert refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alertData, applianceData],
  )
  return { items, loading }
}
