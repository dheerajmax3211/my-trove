import { isApiError, type ApiError } from '@platform/api-client'
import { formatMinor } from './money'

export type ErrorKind =
  'network' | 'conflict' | 'forbidden' | 'not-found' | 'funds' | 'validation' | 'server' | 'unknown'

export interface DescribedError {
  message: string
  kind: ErrorKind
  /** Backend `code`, when the problem document carried one. */
  code: string | null
  /** Form field the message belongs to, when the code identifies one. */
  field: string | null
  /** True when retrying the very same request (same Idempotency-Key) is safe and likely to work. */
  retryable: boolean
  /** True when the Idempotency-Key must be replaced before the user submits again. */
  rotateKey: boolean
}

export interface DescribeContext {
  currency?: string
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null

/** "account would be overdrawn (available 1250 minor units)" -> 1250 */
function availableMinor(detail: string | undefined): number | null {
  const match = /available (-?\d+) minor units/.exec(detail ?? '')
  return match ? Number(match[1]) : null
}

function serverFieldErrors(error: ApiError): Record<string, string> {
  const raw = error.extensions.errors
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [field, value] of Object.entries(raw)) {
    const message = Array.isArray(value)
      ? value.filter((v) => typeof v === 'string').join(' ')
      : text(value)
    if (message) out[field] = message
  }
  return out
}

/** Field-level messages the server may send as an `errors` extension map (field -> message). */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  return isApiError(error) ? serverFieldErrors(error) : {}
}

interface Rule {
  message: (error: ApiError, ctx: DescribeContext) => string
  field?: string
  rotateKey?: boolean
  kind?: ErrorKind
}

const RULES: Record<string, Rule> = {
  INSUFFICIENT_FUNDS: {
    kind: 'funds',
    field: 'amount',
    message: (e, ctx) => {
      const available = availableMinor(e.detail)
      const has =
        available !== null && ctx.currency
          ? ` It only has ${formatMinor(available, ctx.currency)} available.`
          : ''
      return `Not enough money: that would overdraw an account.${has} Nothing was recorded.`
    },
  },
  IDEMPOTENCY_KEY_REUSED: {
    kind: 'conflict',
    rotateKey: true,
    message: () =>
      'This looks like a repeat of an earlier submission, but with different details, so we did not post it. We started a fresh request: check the activity log to make sure the first one did not go through, then submit again.',
  },
  ALREADY_REVERSED: {
    kind: 'conflict',
    message: () => 'That entry has already been reversed. An entry can only be reversed once.',
  },
  CANNOT_REVERSE_REVERSAL: {
    kind: 'conflict',
    message: () => 'A reversal cannot itself be reversed. Record a new entry instead.',
  },
  ALREADY_DECIDED: {
    kind: 'conflict',
    message: () => 'Someone already decided this request. Refresh to see the outcome.',
  },
  APPROVAL_EXPIRED: {
    kind: 'conflict',
    message: () => 'This request expired before it was decided. The requester can submit it again.',
  },
  LAST_OWNER: {
    kind: 'conflict',
    message: () => 'A household needs at least one owner. Make someone else an owner first.',
  },
  ALREADY_MEMBER: {
    kind: 'conflict',
    field: 'uid',
    message: () => 'That person is already a member of this household.',
  },
  ACCOUNT_CODE_TAKEN: {
    kind: 'conflict',
    message: () => 'An account with that code already exists.',
  },
  SELF_APPROVAL: {
    kind: 'forbidden',
    message: () => 'You cannot approve your own request. Another owner or approver has to.',
  },
  ROLE_NOT_ALLOWED: {
    kind: 'forbidden',
    message: () => 'Your role in this household does not allow that.',
  },
  ACCOUNT_NOT_ALLOWED: {
    kind: 'forbidden',
    message: () => 'You are not allowed to use that account for this.',
  },
  SAME_ACCOUNT: {
    kind: 'validation',
    field: 'toAccountId',
    message: () => 'Choose two different accounts.',
  },
  DUPLICATE_SHARE: {
    kind: 'validation',
    message: () => 'Each pot can appear only once in a split.',
  },
  WRONG_ACCOUNT_TYPE: {
    kind: 'validation',
    message: () => 'One of the chosen accounts is the wrong kind for this action.',
  },
  CURRENCY_MISMATCH: {
    kind: 'validation',
    message: () => 'Those accounts use different currencies, which is not supported.',
  },
  START_IN_PAST: {
    kind: 'validation',
    field: 'startDate',
    message: () => 'The start date cannot be in the past: missed periods are never paid back.',
  },
  INVALID_SCHEDULE: {
    kind: 'validation',
    message: () =>
      'An allowance moves money between two different accounts in one currency, into a member pot.',
  },
  AMOUNT_OUT_OF_RANGE: {
    kind: 'validation',
    field: 'amount',
    message: () => 'That amount is out of range.',
  },
  OWNER_NOT_MEMBER: {
    kind: 'validation',
    message: () => 'That person is not a member of this household.',
  },
}

/**
 * Turns anything thrown by the API layer into one plain-language message plus hints for the form
 * (which field, whether a retry is safe, whether to rotate the Idempotency-Key).
 */
export function describeError(error: unknown, ctx: DescribeContext = {}): DescribedError {
  if (!isApiError(error)) {
    return {
      message: 'Something went wrong. Please try again.',
      kind: 'unknown',
      code: null,
      field: null,
      retryable: true,
      rotateKey: false,
    }
  }
  const code = text(error.extensions.code)
  const base = { code, field: null as string | null, rotateKey: false }

  if (error.isNetworkError) {
    return {
      ...base,
      kind: 'network',
      retryable: true,
      message:
        'We could not reach the server. If you were saving something, it may or may not have gone through. Submit again: the same request key is reused, so it can never be recorded twice.',
    }
  }

  const rule = code ? RULES[code] : undefined
  if (rule) {
    return {
      ...base,
      kind: rule.kind ?? 'unknown',
      field: rule.field ?? null,
      rotateKey: rule.rotateKey ?? false,
      retryable: false,
      message: rule.message(error, ctx),
    }
  }

  if (error.status === 401) {
    return {
      ...base,
      kind: 'forbidden',
      retryable: false,
      message: 'Your session has ended. Sign in again.',
    }
  }
  if (error.status === 403) {
    return {
      ...base,
      kind: 'forbidden',
      retryable: false,
      message: error.detail ?? 'You do not have access to that.',
    }
  }
  if (error.status === 404) {
    return {
      ...base,
      kind: 'not-found',
      retryable: false,
      message:
        'We could not find that. It may have been removed, or you may not have access to it.',
    }
  }
  if (error.status === 409) {
    return {
      ...base,
      kind: 'conflict',
      retryable: false,
      message: error.detail ?? 'That conflicts with the current state. Refresh and try again.',
    }
  }
  if (error.status >= 500) {
    return {
      ...base,
      kind: 'server',
      retryable: true,
      message: 'The server had a problem. Please try again in a moment.',
    }
  }
  return {
    ...base,
    kind: 'validation',
    retryable: false,
    message: error.detail ?? error.title,
  }
}
