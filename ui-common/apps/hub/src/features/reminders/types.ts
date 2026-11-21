export type RecurrenceUnit = 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type ReminderStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

export interface Recurrence {
  unit: RecurrenceUnit
  interval: number
}

export interface Reminder {
  id: string
  ownerUid: string
  /** `null` for a personal reminder. */
  householdId: string | null
  title: string
  dueAt: string
  recurrence: Recurrence | null
  status: ReminderStatus
  lastFiredAt: string | null
  createdAt: string
}

export interface ReminderInput {
  title: string
  dueAt: string
  recurrence: Recurrence | null
}
