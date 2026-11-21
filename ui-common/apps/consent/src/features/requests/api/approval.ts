import {
  SENSITIVITIES,
  type AccessRequest,
  type ApproveBody,
  type Attribute,
  type Sensitivity,
} from '../../../shared/api/types'
import { formatDuration, toSeconds, type DurationUnit } from '../../../shared/lib/format'
import { scopeCoversPath } from '../../../shared/lib/scopes'

export interface ApprovalDraft {
  /** Scopes the owner left ticked. */
  scopes: readonly string[]
  durationAmount: string
  durationUnit: DurationUnit
  /** Blank means "as requested". */
  maxReads: string
  maxSensitivity: Sensitivity
}

export interface ApprovalErrors {
  scopes?: string
  duration?: string
  maxReads?: string
}

const MIN_DURATION_SECONDS = 60

const isWholeNumber = (text: string) => /^\d+$/.test(text.trim())

/** Client-side mirror of the gateway's narrowing-only rules, so mistakes are caught before sending. */
export function validateApproval(
  request: AccessRequest,
  draft: ApprovalDraft,
  formatMax: (seconds: number) => string,
): { errors: ApprovalErrors; body: ApproveBody | null } {
  const errors: ApprovalErrors = {}
  if (draft.scopes.length === 0) {
    errors.scopes = 'Keep at least one scope, or deny the request instead.'
  }

  let durationSeconds = request.durationSeconds
  if (!isWholeNumber(draft.durationAmount) || Number(draft.durationAmount) < 1) {
    errors.duration = 'Enter a whole number of at least 1.'
  } else {
    durationSeconds = toSeconds(Number(draft.durationAmount), draft.durationUnit)
    if (durationSeconds < MIN_DURATION_SECONDS)
      errors.duration = 'Access must last at least 1 minute.'
    else if (durationSeconds > request.durationSeconds) {
      errors.duration = `You can only shorten this. The app asked for ${formatMax(request.durationSeconds)}.`
    }
  }

  let maxReads: number | undefined
  if (draft.maxReads.trim() !== '') {
    if (!isWholeNumber(draft.maxReads) || Number(draft.maxReads) < 1) {
      errors.maxReads = 'Enter a whole number of at least 1, or leave it blank.'
    } else {
      maxReads = Number(draft.maxReads)
      if (request.maxReads !== null && maxReads > request.maxReads) {
        errors.maxReads = `You can only lower this. The app asked for ${request.maxReads} reads.`
      }
    }
  }

  if (Object.keys(errors).length > 0) return { errors, body: null }
  return {
    errors,
    body: {
      scopes: [...draft.scopes].sort(),
      durationSeconds,
      ...(maxReads !== undefined ? { maxReads } : {}),
      maxSensitivity: draft.maxSensitivity,
    },
  }
}

export interface Visibility {
  /** Attributes the app will receive. */
  released: Attribute[]
  /** Inside the chosen scopes but above the sensitivity limit: never released. */
  withheld: Attribute[]
}

/** Which of the owner's attributes an approval would expose, in plain terms. */
export function computeVisibility(
  attributes: readonly Attribute[],
  scopes: readonly string[],
  ceiling: Sensitivity,
): Visibility {
  const rank = (level: Sensitivity) => SENSITIVITIES.indexOf(level)
  const covered = attributes.filter((a) => scopes.some((s) => scopeCoversPath(s, a.keyPath)))
  return {
    released: covered.filter((a) => rank(a.sensitivity) <= rank(ceiling)),
    withheld: covered.filter((a) => rank(a.sensitivity) > rank(ceiling)),
  }
}

/** One sentence on how long and how often, from the current form state, for the "will be able to read" summary. */
export function describeTerms(request: AccessRequest, draft: ApprovalDraft): string {
  const { errors } = validateApproval(request, draft, formatDuration)
  const duration = errors.duration
    ? 'the duration you enter'
    : formatDuration(toSeconds(Number(draft.durationAmount), draft.durationUnit))
  const reads =
    draft.maxReads.trim() !== '' && !errors.maxReads ? Number(draft.maxReads) : request.maxReads
  const limit = reads === null ? 'with no limit on reads' : `for at most ${reads} reads`
  return `Access lasts ${duration} from the moment you approve, ${limit}. You can revoke it at any time.`
}
