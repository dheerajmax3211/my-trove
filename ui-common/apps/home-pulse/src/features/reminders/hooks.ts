import { useQuery } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { useApi } from '../../lib/useApi'
import { remindersApi } from './api'

export const REMINDER_HORIZON_DAYS = 60

export function useReminders() {
  const api = useApi(remindersApi)
  return useQuery({
    queryKey: keys.reminders,
    queryFn: ({ signal }) => api.list(REMINDER_HORIZON_DAYS, signal),
  })
}
