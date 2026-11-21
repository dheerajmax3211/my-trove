import { apiQueryKey, useApiMutation, useApiQuery } from '@platform/api-client'
import { sharedPaths } from '../../api/paths'
import type { Reminder, ReminderInput, ReminderStatus } from './types'

const refresh = () => [apiQueryKey(sharedPaths.reminders), apiQueryKey(sharedPaths.audit)]

export interface ReminderQuery {
  householdId?: string
  status?: ReminderStatus
}

/** Without `householdId` the server returns personal reminders plus every household's. */
export const useReminders = ({ householdId, status }: ReminderQuery = {}) =>
  useApiQuery<Reminder[]>(sharedPaths.reminders, {
    query: { ...(householdId ? { householdId } : {}), ...(status ? { status } : {}) },
  })

export const useCreateReminder = () =>
  useApiMutation<Reminder, ReminderInput & { householdId?: string }>({
    path: sharedPaths.reminders,
    invalidate: refresh(),
  })

export const useUpdateReminder = () =>
  useApiMutation<Reminder, ReminderInput & { id: string }>({
    method: 'PUT',
    path: (v) => sharedPaths.reminder(v.id),
    body: ({ title, dueAt, recurrence }) => ({ title, dueAt, recurrence }),
    invalidate: refresh(),
  })

export const useCancelReminder = () =>
  useApiMutation<Reminder, { id: string }>({
    path: (v) => sharedPaths.cancelReminder(v.id),
    body: () => undefined,
    invalidate: refresh(),
  })
