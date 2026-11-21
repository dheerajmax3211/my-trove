import { isApiError, type ApiError } from '@platform/api-client'

const GENERIC_VALIDATION = 'Invalid request content.'

/** A readable, specific sentence for any failure. Never shows status lines or stack traces. */
export function describeError(error: unknown): string {
  if (!isApiError(error)) return 'Something unexpected went wrong. Please try again.'
  if (error.isNetworkError)
    return 'We could not reach the server. Check your connection and try again.'
  if (error.status === 401) return 'Your session has expired. Sign in again to continue.'
  if (error.status === 404)
    return 'We could not find that item. It may not exist or may not be yours.'
  if (error.status === 409) {
    const closed = /already (\w+)/i.exec(error.detail ?? '')
    return closed?.[1]
      ? `This item is already ${closed[1].toLowerCase()}, so nothing was changed.`
      : (error.detail ?? 'This item changed in the meantime. Reload and try again.')
  }
  if (error.status === 400)
    return !error.detail || error.detail === GENERIC_VALIDATION
      ? 'Some details were not accepted. Check the fields and try again.'
      : error.detail
  if (error.status === 503)
    return error.detail ?? 'The follow-up scheduler is unavailable. Nothing was changed; try again.'
  if (error.isServerError) return 'Something went wrong on our side. Please try again in a moment.'
  return error.detail ?? error.title
}

export interface ServerFieldErrors {
  /** Messages keyed by request field name (`title`, `amount`, `plan.expireAfterDays`...). */
  fields: Record<string, string>
}

/**
 * Field-level messages from a problem document's `errors` extension, if the server sent any.
 * Accepts `{ field: ['msg'] }`, `{ field: 'msg' }` and `[{ field, message }]`. The current service
 * answers validation failures with a generic 400 and no field list; this keeps the form ready for both.
 */
export function serverFieldErrors(error: ApiError | null | undefined): ServerFieldErrors {
  const fields: Record<string, string> = {}
  const raw = error?.extensions.errors
  if (Array.isArray(raw)) {
    for (const entry of raw as unknown[]) {
      if (typeof entry !== 'object' || entry === null) continue
      const { field, message } = entry as { field?: unknown; message?: unknown }
      if (typeof field === 'string' && typeof message === 'string') fields[field] ??= message
    }
  } else if (typeof raw === 'object' && raw !== null) {
    for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
      const message = Array.isArray(value)
        ? value.filter((v) => typeof v === 'string').join(' ')
        : value
      if (typeof message === 'string' && message) fields[field] = message
    }
  }
  return { fields }
}
