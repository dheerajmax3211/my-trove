import type {
  Audience,
  ChannelType,
  Contact,
  EscalationStep,
  SwitchPolicy,
  Urgency,
} from '../../api/types'
import { URGENCIES } from '../../api/types'
import { DAY, HOUR } from '../../lib/format'

/** Limits the service enforces (application.properties defaults). The server remains the authority. */
export const POLICY_LIMITS = {
  minInterval: HOUR,
  maxInterval: 366 * DAY,
  maxGrace: 90 * DAY,
  minCoolOff: HOUR,
  maxCoolOff: 30 * DAY,
  maxEscalation: 90 * DAY,
  maxPause: 60 * DAY,
  maxSteps: 10,
  maxContacts: 5,
} as const

export type DurationUnit = 'hours' | 'days'

export interface DurationInput {
  value: string
  unit: DurationUnit
}

export interface StepInput {
  offset: DurationInput
  urgency: Urgency
  audience: Audience
  channels: ChannelType[]
}

export interface PolicyInput {
  interval: DurationInput
  grace: DurationInput
  escalation: DurationInput
  coolOff: DurationInput
  maxPause: DurationInput
  steps: StepInput[]
  contacts: Contact[]
}

export type PolicyErrors = Record<string, string>

const UNIT_SECONDS: Record<DurationUnit, number> = { hours: HOUR, days: DAY }

export function secondsToInput(seconds: number): DurationInput {
  if (seconds > 0 && seconds % DAY === 0) return { value: String(seconds / DAY), unit: 'days' }
  return { value: String(Math.round((seconds / HOUR) * 100) / 100), unit: 'hours' }
}

/** Whole seconds, or null when the text is not a non-negative number. */
export function inputToSeconds(input: DurationInput): number | null {
  const text = input.value.trim()
  if (text === '' || !/^\d+(\.\d+)?$/.test(text)) return null
  return Math.round(Number(text) * UNIT_SECONDS[input.unit])
}

export function policyToInput(policy: SwitchPolicy): PolicyInput {
  return {
    interval: secondsToInput(policy.checkInIntervalSeconds),
    grace: secondsToInput(policy.graceSeconds),
    escalation: secondsToInput(policy.escalationDurationSeconds),
    coolOff: secondsToInput(policy.coolOffSeconds),
    maxPause: secondsToInput(policy.maxPauseSeconds),
    steps: policy.steps.map((s) => ({
      offset: secondsToInput(s.offsetSeconds),
      urgency: s.urgency,
      audience: s.audience,
      channels: [...s.channels],
    })),
    contacts: policy.ownerContacts.map((c) => ({ ...c })),
  }
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PHONE = /^\+[1-9][0-9]{6,14}$/

export function contactError(contact: Contact): string | null {
  const address = contact.address.trim()
  if (address === '') return 'Enter an address.'
  if (contact.channel === 'EMAIL' && !EMAIL.test(address)) return 'Enter a valid email address.'
  if (contact.channel === 'SMS' && !PHONE.test(address))
    return 'Enter the number in international format, like +14155550123.'
  if (contact.channel === 'PUSH' && (address.length < 8 || address.includes(' ')))
    return 'A push address is at least 8 characters with no spaces.'
  return null
}

function range(
  errors: PolicyErrors,
  key: string,
  seconds: number | null,
  min: number,
  max: number,
  what: string,
): void {
  if (seconds === null) errors[key] = `Enter ${what} as a number.`
  else if (seconds < min || seconds > max)
    errors[key] =
      `${what[0]?.toUpperCase() ?? ''}${what.slice(1)} must be between ${describeLimit(min)} and ${describeLimit(max)}.`
}

function describeLimit(seconds: number): string {
  if (seconds === 0) return '0'
  return seconds % DAY === 0 ? `${seconds / DAY} days` : `${seconds / HOUR} hours`
}

/** Mirrors the server's PolicyValidator so mistakes are caught before the request. */
export function validatePolicyInput(
  input: PolicyInput,
  quorum: number,
): { policy: SwitchPolicy | null; errors: PolicyErrors } {
  const errors: PolicyErrors = {}
  const interval = inputToSeconds(input.interval)
  const grace = inputToSeconds(input.grace)
  const escalation = inputToSeconds(input.escalation)
  const coolOff = inputToSeconds(input.coolOff)
  const maxPause = inputToSeconds(input.maxPause)
  range(
    errors,
    'interval',
    interval,
    POLICY_LIMITS.minInterval,
    POLICY_LIMITS.maxInterval,
    'the check-in interval',
  )
  range(errors, 'grace', grace, 0, POLICY_LIMITS.maxGrace, 'the grace period')
  range(errors, 'escalation', escalation, 0, POLICY_LIMITS.maxEscalation, 'the escalation length')
  range(
    errors,
    'coolOff',
    coolOff,
    POLICY_LIMITS.minCoolOff,
    POLICY_LIMITS.maxCoolOff,
    'the cool-off',
  )
  range(errors, 'maxPause', maxPause, 0, POLICY_LIMITS.maxPause, 'the longest pause')

  const steps: EscalationStep[] = []
  if (input.steps.length === 0) errors.steps = 'Add at least one reminder step.'
  if (input.steps.length > POLICY_LIMITS.maxSteps)
    errors.steps = `Use at most ${POLICY_LIMITS.maxSteps} reminder steps.`
  let prevOffset = -1
  let prevUrgency = -1
  input.steps.forEach((step, i) => {
    const offset = inputToSeconds(step.offset)
    if (offset === null) errors[`step.${i}.offset`] = 'Enter the time as a number.'
    else {
      if (offset <= prevOffset)
        errors[`step.${i}.offset`] = 'Each step must come after the one before it.'
      prevOffset = offset
    }
    const urgency = URGENCIES.indexOf(step.urgency)
    if (urgency < prevUrgency)
      errors[`step.${i}.urgency`] = 'Urgency can rise but never fall from one step to the next.'
    prevUrgency = Math.max(prevUrgency, urgency)
    if (step.channels.length === 0)
      errors[`step.${i}.channels`] = 'Pick at least one way to reach them.'
    steps.push({
      offsetSeconds: offset ?? 0,
      urgency: step.urgency,
      audience: step.audience,
      channels: step.channels,
    })
  })
  if (escalation !== null && prevOffset > escalation)
    errors.escalation = 'The escalation must last at least until the last reminder step.'

  if (input.contacts.length === 0) errors.contacts = 'Add at least one way to reach you.'
  if (input.contacts.length > POLICY_LIMITS.maxContacts)
    errors.contacts = `Use at most ${POLICY_LIMITS.maxContacts} contacts.`
  const seen = new Set<string>()
  input.contacts.forEach((contact, i) => {
    const problem = contactError(contact)
    if (problem) errors[`contact.${i}`] = problem
    else {
      const key = `${contact.channel}:${contact.address.trim()}`
      if (seen.has(key)) errors[`contact.${i}`] = 'You already added this contact.'
      seen.add(key)
    }
  })

  if (
    Object.keys(errors).length > 0 ||
    interval === null ||
    grace === null ||
    escalation === null ||
    coolOff === null ||
    maxPause === null
  )
    return { policy: null, errors }
  return {
    errors,
    policy: {
      checkInIntervalSeconds: interval,
      graceSeconds: grace,
      escalationDurationSeconds: escalation,
      steps,
      coolOffSeconds: coolOff,
      quorum,
      maxPauseSeconds: maxPause,
      ownerContacts: input.contacts.map((c) => ({ channel: c.channel, address: c.address.trim() })),
    },
  }
}
