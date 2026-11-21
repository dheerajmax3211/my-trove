import { isApiError, type ApiError } from '@platform/api-client'

/** A readable sentence for any failure. Never leaks stack traces or raw JSON. */
export function errorMessage(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong. Please try again.'
  if (error.isNetworkError)
    return 'Could not reach the Home Pulse service. Check your connection and try again.'
  if (error.status === 401) return 'Your session has ended. Sign in again to continue.'
  if (error.status === 404) return error.detail ?? 'That item no longer exists.'
  if (error.isServerError) return 'The Home Pulse service had a problem. Please try again shortly.'
  return error.detail ?? error.title
}

export type FieldErrors = Record<string, string>

/**
 * Maps a problem document onto form fields. Two shapes are understood:
 *  - an `errors` extension: `{ errors: { name: ['must not be blank'] } }`
 *  - the Spring text the home-pulse service sends: `detail: "name must not be blank; type must not be null"`,
 *    where each clause starts with a field name from `knownFields`.
 * Clauses that match no known field are returned under the key `''` (a form-level message).
 */
export function fieldErrorsFrom(error: unknown, knownFields: readonly string[]): FieldErrors {
  if (!isApiError(error) || error.status !== 400) return {}
  return parseProblem(error, knownFields)
}

function parseProblem(error: ApiError, knownFields: readonly string[]): FieldErrors {
  const out: FieldErrors = {}
  const extension = error.extensions.errors
  if (typeof extension === 'object' && extension !== null && !Array.isArray(extension)) {
    for (const [field, messages] of Object.entries(extension as Record<string, unknown>)) {
      const first = Array.isArray(messages) ? (messages as unknown[])[0] : messages
      if (typeof first === 'string') out[field] = first
    }
    if (Object.keys(out).length > 0) return out
  }
  if (!error.detail) return out
  for (const clause of error.detail.split(';').map((c) => c.trim())) {
    if (!clause) continue
    const field = knownFields.find((f) => clause.startsWith(`${f} `))
    if (field) out[field] = capitalize(clause.slice(field.length + 1))
    else out[''] = out[''] ? `${out['']} ${capitalize(clause)}` : capitalize(clause)
  }
  return out
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)
