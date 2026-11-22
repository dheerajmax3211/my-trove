/** Mirrors Reminder and Reminder.Type. */
export type ReminderType =
  'SERVICE_OVERDUE' | 'SERVICE_DUE' | 'WARRANTY_ENDING' | 'WARRANTY_CLAIM_WINDOW'

/** Mirrors Reminder.Source: the record the reminder's date comes from. */
export type ReminderSource = 'SERVICE_DATE' | 'WARRANTY_DATE' | 'ALERT'

export interface Reminder {
  applianceId: string
  applianceName: string
  type: ReminderType
  source: ReminderSource
  dueDate: string
  /** Negative when overdue. */
  daysUntil: number
  highPriority: boolean
  message: string
}
