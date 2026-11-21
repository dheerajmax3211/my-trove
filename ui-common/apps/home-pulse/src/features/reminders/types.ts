/** Mirrors Reminder and Reminder.Type. */
export type ReminderType =
  'SERVICE_OVERDUE' | 'SERVICE_DUE' | 'WARRANTY_ENDING' | 'WARRANTY_CLAIM_WINDOW'

export interface Reminder {
  applianceId: string
  applianceName: string
  type: ReminderType
  dueDate: string
  /** Negative when overdue. */
  daysUntil: number
  highPriority: boolean
  message: string
}
