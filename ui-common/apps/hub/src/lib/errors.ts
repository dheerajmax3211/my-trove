import { isApiError } from '@platform/api-client'

/** Spring's generic body for a failed bean validation; it names no field, so we say it plainly. */
const GENERIC_VALIDATION_DETAIL = 'Invalid request content.'

/** One readable sentence for any failure. Prefers the server's own business message when it has one. */
export function errorMessage(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong. Try again.'
  if (error.status === 0)
    return 'We could not reach the server. Check your connection and try again.'
  if (error.status === 401) return 'Your session has ended. Sign in again to continue.'
  if (error.detail && error.detail !== GENERIC_VALIDATION_DETAIL) return error.detail
  if (error.status === 400)
    return 'The server did not accept those values. Check the form and try again.'
  if (error.status === 403) return 'You do not have permission to do that.'
  if (error.status === 404) return 'We could not find that. It may have been removed.'
  if (error.status >= 500) return 'The server had a problem. Try again in a moment.'
  return error.title
}

/** Short heading for a full-panel error state. */
export function errorHeading(error: unknown): string {
  if (isApiError(error) && error.status === 0) return 'Cannot reach the server'
  if (isApiError(error) && error.status === 403) return 'Not allowed'
  if (isApiError(error) && error.status === 404) return 'Not found'
  return 'Something went wrong'
}

export function statusOf(error: unknown): number | null {
  return isApiError(error) ? error.status : null
}
