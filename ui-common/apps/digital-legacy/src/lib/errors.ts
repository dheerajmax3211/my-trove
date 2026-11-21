import { isApiError } from '@platform/api-client'
import { isCryptoError } from '../crypto'
import { ShamirError } from '../crypto/shamir'

/** Turns anything thrown by the API layer, the crypto layer or Shamir into one readable sentence. */
export function describeError(error: unknown): string {
  if (isApiError(error)) {
    if (error.isNetworkError)
      return 'The server could not be reached. Check your connection and try again.'
    const problems = error.extensions.problems
    if (Array.isArray(problems) && problems.length > 0)
      return problems.filter((p): p is string => typeof p === 'string').join(' ')
    if (error.status === 401) return 'You are not signed in, or the session has expired.'
    return error.detail ?? error.title
  }
  if (isCryptoError(error)) {
    switch (error.code) {
      case 'wrong-key':
        return 'That key does not open this data. Make sure you are using the right key file.'
      case 'wrong-passphrase':
        return 'The passphrase is wrong, or the file was altered.'
      default:
        return error.message
    }
  }
  if (error instanceof ShamirError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
