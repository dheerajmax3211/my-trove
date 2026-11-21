import { fromLocalInputValue } from '../../lib/format'
import type { RecurrenceUnit, ReminderInput } from './types'

export interface ReminderForm {
  title: string
  /** `datetime-local` value. */
  due: string
  repeat: 'NONE' | RecurrenceUnit
  interval: string
}

export interface ReminderFormErrors {
  title?: string
  due?: string
  interval?: string
}

export const TITLE_MAX = 300
export const INTERVAL_MAX = 365

/** Mirrors the server rules so mistakes are caught before a round trip (the server only says "invalid"). */
export function validateReminder(form: ReminderForm): {
  errors: ReminderFormErrors
  input: ReminderInput | null
} {
  const errors: ReminderFormErrors = {}
  const title = form.title.trim()
  if (!title) errors.title = 'Give the reminder a title.'
  else if (form.title.length > TITLE_MAX)
    errors.title = `Keep the title under ${TITLE_MAX} characters.`

  const dueAt = fromLocalInputValue(form.due)
  if (!dueAt) errors.due = 'Choose when it is due.'

  let recurrence: ReminderInput['recurrence'] = null
  if (form.repeat !== 'NONE') {
    const interval = Number(form.interval)
    if (!Number.isInteger(interval) || interval < 1 || interval > INTERVAL_MAX)
      errors.interval = `Enter a whole number from 1 to ${INTERVAL_MAX}.`
    else recurrence = { unit: form.repeat, interval }
  }

  if (Object.keys(errors).length > 0 || !dueAt) return { errors, input: null }
  return { errors, input: { title, dueAt, recurrence } }
}
