import { isApiError, type ApiError } from '@platform/api-client'

export interface ErrorMessage {
  title: string
  message: string
}

/** A short, plain explanation of a failed call, safe to show to the owner. */
export function describeError(error: unknown): ErrorMessage {
  if (!isApiError(error)) {
    return { title: 'Something went wrong', message: 'An unexpected error occurred. Try again.' }
  }
  if (error.isNetworkError) {
    return {
      title: 'Cannot reach the gateway',
      message: 'Check your connection and that the consent gateway is running, then try again.',
    }
  }
  if (error.isUnauthorized) {
    return { title: 'You have been signed out', message: 'Sign in again to continue.' }
  }
  if (error.isServerError) {
    return {
      title: 'The gateway had a problem',
      message: 'This is not your fault. Try again in a moment.',
    }
  }
  return {
    title: error.title,
    message: error.detail ?? 'The gateway could not complete this request.',
  }
}

/** The stable machine-readable `code` of a gateway problem document, if any. */
export function errorCode(error: unknown): string | undefined {
  if (!isApiError(error)) return undefined
  const code = error.extensions.code
  return typeof code === 'string' ? code : undefined
}

/**
 * Field-level messages from a `VALIDATION_FAILED` problem: `{ errors: { field: "message" } }`.
 * List-element fields such as `allowedScopes[0]` are folded into their parent field.
 */
export function fieldErrors(error: ApiError | null | undefined): Record<string, string> {
  const raw = error?.extensions.errors
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const message = Array.isArray(value) ? value.join(' ') : value
    if (typeof message !== 'string') continue
    const field = key.replace(/\[\d+\]$/, '')
    result[field] ??= message
  }
  return result
}
