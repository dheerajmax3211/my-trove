import { APPLIANCE_TYPES, type ApplianceType } from '../features/appliances/types'

export interface ApplianceBody {
  name: string
  type: ApplianceType
  location: string | null
  purchaseDate: string | null
  warrantyEndDate: string | null
  lastServiceDate: string | null
  nextServiceDate: string | null
  notes: string | null
}

export class BadRequest extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DATE_FIELDS = [
  'purchaseDate',
  'warrantyEndDate',
  'lastServiceDate',
  'nextServiceDate',
] as const

const asText = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/**
 * The rules of ApplianceRequest, with the same wording Spring produces: `field message` clauses sorted and
 * joined with "; ". Throws `BadRequest` with that detail text.
 */
export function parseApplianceBody(raw: unknown): ApplianceBody {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new BadRequest('Failed to read request')
  const body = raw as Record<string, unknown>
  for (const field of DATE_FIELDS) {
    const value = body[field]
    if (
      value != null &&
      (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(value)))
    )
      throw new BadRequest('Failed to read request')
  }
  if (body.type != null && !APPLIANCE_TYPES.includes(body.type as ApplianceType))
    throw new BadRequest('Failed to read request')

  const clauses: string[] = []
  const name = asText(body.name)
  if (name === null || name.trim() === '') clauses.push('name must not be blank')
  else if (name.length > 120) clauses.push('name size must be between 0 and 120')
  if (body.type == null) clauses.push('type must not be null')
  const location = asText(body.location)
  if (location !== null && location.length > 120)
    clauses.push('location size must be between 0 and 120')
  const notes = asText(body.notes)
  if (notes !== null && notes.length > 2000) clauses.push('notes size must be between 0 and 2000')
  if (clauses.length > 0) throw new BadRequest(clauses.sort().join('; '))

  const parsed: ApplianceBody = {
    name: name ?? '',
    type: body.type as ApplianceType,
    location,
    purchaseDate: asText(body.purchaseDate),
    warrantyEndDate: asText(body.warrantyEndDate),
    lastServiceDate: asText(body.lastServiceDate),
    nextServiceDate: asText(body.nextServiceDate),
    notes,
  }
  if (parsed.purchaseDate && parsed.warrantyEndDate && parsed.warrantyEndDate < parsed.purchaseDate)
    throw new BadRequest('warrantyEndDate must not be before purchaseDate')
  if (
    parsed.lastServiceDate &&
    parsed.nextServiceDate &&
    parsed.nextServiceDate < parsed.lastServiceDate
  )
    throw new BadRequest('nextServiceDate must not be before lastServiceDate')
  return parsed
}

export function parseLabel(raw: unknown): string {
  const label =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).label : undefined
  if (typeof raw !== 'object' || raw === null) throw new BadRequest('Failed to read request')
  if (typeof label !== 'string' || label.trim() === '')
    throw new BadRequest('label must not be blank')
  if (label.length > 120) throw new BadRequest('label size must be between 0 and 120')
  return label
}
