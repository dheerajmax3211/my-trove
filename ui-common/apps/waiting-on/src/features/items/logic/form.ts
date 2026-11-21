import { calendarDaysBetween, parseCalendarDate } from '../../../lib/dates'
import type { CreateItemInput, ItemCategory, Plan } from '../api/types'
import { ITEM_CATEGORIES } from '../api/types'
import { defaultPlan, validatePlan, type PlanErrors } from './schedule'

export interface NewItemValues {
  title: string
  counterparty: string
  counterpartyEmail: string
  category: ItemCategory | ''
  amount: string
  currency: string
  expectedBy: string
  customise: boolean
  plan: Record<keyof Plan, string>
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CHF', 'SGD', 'AED']

export const emptyValues = (): NewItemValues => ({
  title: '',
  counterparty: '',
  counterpartyEmail: '',
  category: '',
  amount: '',
  currency: 'USD',
  expectedBy: '',
  customise: false,
  plan: {
    nudgeAfterDays: '',
    escalateAfterDays: '',
    finalNoticeAfterDays: '',
    expireAfterDays: '',
  },
})

export type FieldKey =
  'title' | 'counterparty' | 'counterpartyEmail' | 'category' | 'amount' | 'currency' | 'expectedBy'

export type NewItemErrors = Partial<Record<FieldKey, string>> & { plan?: PlanErrors }

export const hasErrors = (errors: NewItemErrors): boolean => Object.keys(errors).length > 0

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/

/** Days from `today` to the expected date, or null when the date is missing or invalid. */
export function daysUntil(expectedBy: string, today: Date): number | null {
  const date = parseCalendarDate(expectedBy)
  return date ? calendarDaysBetween(today, date) : null
}

export function planFromStrings(values: NewItemValues['plan']): Plan {
  const n = (s: string) => (s.trim() === '' ? Number.NaN : Number(s))
  return {
    nudgeAfterDays: n(values.nudgeAfterDays),
    escalateAfterDays: n(values.escalateAfterDays),
    finalNoticeAfterDays: n(values.finalNoticeAfterDays),
    expireAfterDays: n(values.expireAfterDays),
  }
}

export function planToStrings(plan: Plan): NewItemValues['plan'] {
  return {
    nudgeAfterDays: String(plan.nudgeAfterDays),
    escalateAfterDays: String(plan.escalateAfterDays),
    finalNoticeAfterDays: String(plan.finalNoticeAfterDays),
    expireAfterDays: String(plan.expireAfterDays),
  }
}

/** The plan the service will create for these values: custom when enabled, otherwise the category default. */
export function effectivePlan(values: NewItemValues, today: Date): Plan | null {
  if (values.customise) return planFromStrings(values.plan)
  const days = daysUntil(values.expectedBy, today)
  if (days === null || values.category === '') return null
  return defaultPlan(values.category, days)
}

export function validateNewItem(values: NewItemValues): NewItemErrors {
  const errors: NewItemErrors = {}
  const title = values.title.trim()
  if (!title) errors.title = 'Say what you are waiting for.'
  else if (title.length > 200) errors.title = 'Keep this to 200 characters or fewer.'

  const counterparty = values.counterparty.trim()
  if (!counterparty) errors.counterparty = 'Say who you are waiting on.'
  else if (counterparty.length > 200) errors.counterparty = 'Keep this to 200 characters or fewer.'

  const email = values.counterpartyEmail.trim()
  if (email && (!EMAIL.test(email) || email.length > 320))
    errors.counterpartyEmail = 'Enter a valid email address, or leave this blank.'

  if (!ITEM_CATEGORIES.includes(values.category as ItemCategory))
    errors.category = 'Choose the closest category.'

  const amount = values.amount.trim()
  if (amount && !AMOUNT.test(amount))
    errors.amount = 'Enter a positive amount with at most 2 decimal places, such as 129.99.'
  if (amount && !values.currency) errors.currency = 'Choose a currency for the amount.'

  if (!values.expectedBy) errors.expectedBy = 'Choose the date you expected this by.'
  else if (!parseCalendarDate(values.expectedBy)) errors.expectedBy = 'Enter a valid date.'

  if (values.customise) {
    const planErrors = validatePlan(planFromStrings(values.plan))
    if (Object.keys(planErrors).length > 0) errors.plan = planErrors
  }
  return errors
}

/** Build the request body from validated values. Optional parts are omitted, never sent empty. */
export function toCreateInput(values: NewItemValues): CreateItemInput {
  const amount = values.amount.trim()
  const email = values.counterpartyEmail.trim()
  return {
    title: values.title.trim(),
    counterparty: values.counterparty.trim(),
    ...(email ? { counterpartyEmail: email } : {}),
    category: values.category as ItemCategory,
    ...(amount ? { amount: Number(amount), currency: values.currency } : {}),
    expectedBy: values.expectedBy,
    ...(values.customise ? { plan: planFromStrings(values.plan) } : {}),
  }
}
