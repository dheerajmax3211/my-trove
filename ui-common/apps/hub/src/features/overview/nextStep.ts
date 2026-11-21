export interface NextStep {
  text: string
  label: string
  /** Relative to the module base. */
  to: string
}

export interface NextStepInput {
  householdId: string
  callerRole: 'OWNER' | 'MEMBER'
  memberCount: number
  /** Active reminders that belong to this household. */
  activeReminders: number
  /** Files saved to this household. */
  files: number
  /** The soonest active reminder, if any. */
  nextReminderTitle?: string | undefined
}

/** The one thing worth doing next, in the order a household usually fills up. */
export function nextStep(input: NextStepInput): NextStep {
  if (input.memberCount <= 1 && input.callerRole === 'OWNER')
    return {
      text: 'It is just you so far. Invite someone with a one-time code.',
      label: 'Invite someone',
      to: `/households/${input.householdId}`,
    }
  if (input.activeReminders === 0)
    return {
      text: 'Nothing is on the shared list yet. Add the first reminder.',
      label: 'Add a reminder',
      to: '/reminders',
    }
  if (input.files === 0)
    return {
      text: 'No files are shared yet. Upload one so everyone can find it.',
      label: 'Add a file',
      to: '/files',
    }
  return {
    text: input.nextReminderTitle
      ? `Next up on the list: ${input.nextReminderTitle}.`
      : 'Everything is in place.',
    label: 'See reminders',
    to: '/reminders',
  }
}
