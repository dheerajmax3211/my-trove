import type { FieldErrors } from '../../lib/errors'
import type { Appliance, ApplianceInput, ApplianceType } from './types'
import { APPLIANCE_TYPES } from './types'

export interface ApplianceFormValues {
  name: string
  type: ApplianceType | ''
  location: string
  purchaseDate: string
  warrantyEndDate: string
  lastServiceDate: string
  nextServiceDate: string
  notes: string
}

export const FORM_FIELDS = [
  'name',
  'type',
  'location',
  'purchaseDate',
  'warrantyEndDate',
  'lastServiceDate',
  'nextServiceDate',
  'notes',
] as const satisfies readonly (keyof ApplianceFormValues)[]

export const EMPTY_FORM: ApplianceFormValues = {
  name: '',
  type: '',
  location: '',
  purchaseDate: '',
  warrantyEndDate: '',
  lastServiceDate: '',
  nextServiceDate: '',
  notes: '',
}

export function toFormValues(appliance: Appliance): ApplianceFormValues {
  return {
    name: appliance.name,
    type: appliance.type,
    location: appliance.location ?? '',
    purchaseDate: appliance.purchaseDate ?? '',
    warrantyEndDate: appliance.warrantyEndDate ?? '',
    lastServiceDate: appliance.lastServiceDate ?? '',
    nextServiceDate: appliance.nextServiceDate ?? '',
    notes: appliance.notes ?? '',
  }
}

/** The same rules the service enforces, so most mistakes are caught before a request is made. */
export function validateForm(values: ApplianceFormValues): FieldErrors {
  const errors: FieldErrors = {}
  const name = values.name.trim()
  if (!name) errors.name = 'Enter a name for the appliance.'
  else if (name.length > 120) errors.name = 'Use 120 characters or fewer.'
  if (!values.type || !APPLIANCE_TYPES.includes(values.type)) errors.type = 'Choose a type.'
  if (values.location.trim().length > 120) errors.location = 'Use 120 characters or fewer.'
  if (values.notes.length > 2000) errors.notes = 'Use 2,000 characters or fewer.'
  // ISO dates compare correctly as strings.
  if (values.purchaseDate && values.warrantyEndDate && values.warrantyEndDate < values.purchaseDate)
    errors.warrantyEndDate = 'The warranty cannot end before the purchase date.'
  if (
    values.lastServiceDate &&
    values.nextServiceDate &&
    values.nextServiceDate < values.lastServiceDate
  )
    errors.nextServiceDate = 'The next service cannot be before the last one.'
  return errors
}

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim())

/** Request body: empty optional fields are sent as null so clearing a date really clears it. */
export function toInput(values: ApplianceFormValues): ApplianceInput {
  if (values.type === '') throw new Error('toInput called with an invalid form')
  return {
    name: values.name.trim(),
    type: values.type,
    location: blankToNull(values.location),
    purchaseDate: blankToNull(values.purchaseDate),
    warrantyEndDate: blankToNull(values.warrantyEndDate),
    lastServiceDate: blankToNull(values.lastServiceDate),
    nextServiceDate: blankToNull(values.nextServiceDate),
    notes: blankToNull(values.notes),
  }
}
