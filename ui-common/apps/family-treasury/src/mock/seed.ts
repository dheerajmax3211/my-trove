import type { AllowanceRun, Frequency, ScheduleView } from '../api/types'
import { EXPENSE_GENERAL, POOL, accountByCode } from './ledger'
import type { MockBackend } from './mockBackend'

export interface Persona {
  uid: string
  name: string
  email: string
  blurb: string
}

/** People you can sign in as in demo mode. Roles differ per household; these blurbs describe the main one. */
export const PERSONAS: readonly Persona[] = [
  {
    uid: 'u-maya',
    name: 'Maya Okafor',
    email: 'maya@okafor.test',
    blurb: 'Owner. Can do everything.',
  },
  {
    uid: 'u-dev',
    name: 'Dev Okafor',
    email: 'dev@okafor.test',
    blurb: 'Approver. Can approve large spends.',
  },
  {
    uid: 'u-sam',
    name: 'Sam Okafor',
    email: 'sam@okafor.test',
    blurb: 'Member. Large spends need approval.',
  },
  {
    uid: 'u-ada',
    name: 'Ada Okafor',
    email: 'ada@okafor.test',
    blurb: 'Kid. Sees only her own pot.',
  },
]

export const DEMO_HOUSEHOLD = 'Okafor family'
export const DEMO_TRIP = 'Lisbon trip'

const DAY = 86_400_000
const dateOnly = (d: Date): string => d.toISOString().slice(0, 10)

function addMonthsUtc(day: string, months: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return dateOnly(d)
}

/**
 * Fills the mock with a believable household history relative to the backend's clock: a funded pool, member pots,
 * a split with rounding, a reversed entry, approvals in every state and two allowance schedules whose run history
 * includes PAID, SKIPPED and FAILED periods.
 */
export function seedDemo(backend: MockBackend): void {
  const now = backend.now()
  const ago = (days: number, hours = 0): Date =>
    new Date(now.getTime() - days * DAY - hours * 3_600_000)

  const h = backend.createHousehold({
    name: DEMO_HOUSEHOLD,
    currency: 'USD',
    ownerUid: 'u-maya',
    ownerName: 'Maya Okafor',
    approvalThresholdMinor: 10_000,
    approvalExpiryHours: 72,
    createdAt: ago(40),
  })
  backend.addMember(h, 'u-dev', 'APPROVER', 'Dev Okafor')
  backend.addMember(h, 'u-sam', 'MEMBER', 'Sam Okafor')
  backend.addMember(h, 'u-ada', 'KID', 'Ada Okafor')
  backend.addAccount(h, null, 'EXPENSE:GROCERIES', 'Groceries', 'EXPENSE', 'USD', false)
  backend.addAccount(h, null, 'EXPENSE:UTILITIES', 'Utilities', 'EXPENSE', 'USD', false)
  backend.addAccount(h, null, 'EXPENSE:FUN', 'Fun and outings', 'EXPENSE', 'USD', false)

  const income = 'INCOME:DEPOSITS'
  const deposit = (days: number, who: string, amount: number, text: string) =>
    backend.post(
      h,
      'DEPOSIT',
      text,
      who,
      [
        { code: POOL, amount },
        { code: income, amount: -amount },
      ],
      ago(days),
    )
  const spend = (
    days: number,
    who: string,
    amount: number,
    category: string,
    text: string,
    from = POOL,
  ) =>
    backend.post(
      h,
      'SPEND',
      text,
      who,
      [
        { code: from, amount: -amount },
        { code: category, amount },
      ],
      ago(days),
    )
  const move = (
    days: number,
    kind: 'TRANSFER' | 'ALLOWANCE',
    who: string,
    to: string,
    amount: number,
    text: string,
  ) =>
    backend.post(
      h,
      kind,
      text,
      who,
      [
        { code: POOL, amount: -amount },
        { code: `POT:${to}`, amount },
      ],
      ago(days),
    )

  deposit(36, 'u-maya', 240_000, 'October household contributions')
  move(35, 'ALLOWANCE', 'u-maya', 'u-sam', 2_500, `Sam monthly allowance (${dateOnly(ago(35))})`)
  spend(32, 'u-dev', 8_640, 'EXPENSE:GROCERIES', 'Weekly groceries')
  spend(30, 'u-maya', 14_215, 'EXPENSE:UTILITIES', 'Electricity bill')
  move(28, 'TRANSFER', 'u-maya', 'u-sam', 6_000, 'Sam pocket money')
  move(27, 'TRANSFER', 'u-maya', 'u-maya', 10_000, 'Maya personal pot top-up')
  spend(26, 'u-sam', 5_420, 'EXPENSE:GROCERIES', 'Weekly groceries')
  deposit(25, 'u-maya', 45_000, 'Birthday money from Grandma')
  move(25, 'ALLOWANCE', 'u-maya', 'u-ada', 1_000, 'Weekly allowance for Ada')
  move(24, 'TRANSFER', 'u-maya', 'u-ada', 4_000, 'Birthday money for Ada')
  spend(20, 'u-dev', 9_175, 'EXPENSE:GROCERIES', 'Weekly groceries')
  spend(17, 'u-dev', 3_800, 'EXPENSE:FUN', 'Cinema night')

  const dentist = backend.createApproval(
    h,
    'u-sam',
    'Dentist visit',
    12_000,
    ago(9),
    POOL,
    EXPENSE_GENERAL,
  )
  const dentistEntry = backend.post(
    h,
    'SPEND',
    'Dentist visit',
    'u-maya',
    [
      { code: POOL, amount: -12_000 },
      { code: EXPENSE_GENERAL, amount: 12_000 },
    ],
    ago(8, 20),
    { approvalId: dentist.id },
  )
  Object.assign(dentist, {
    status: 'APPROVED',
    decidedByUid: 'u-maya',
    decidedAt: ago(8, 20).toISOString(),
    entryId: dentistEntry.id,
  })

  spend(8, 'u-dev', 7_330, 'EXPENSE:GROCERIES', 'Weekly groceries')
  backend.post(
    h,
    'SPLIT',
    'Zoo tickets',
    'u-maya',
    [
      { code: 'EXPENSE:FUN', amount: 10_000 },
      { code: 'POT:u-maya', amount: -3_334 },
      { code: 'POT:u-sam', amount: -3_333 },
      { code: 'POT:u-ada', amount: -3_333 },
    ],
    ago(7),
  )
  spend(6, 'u-dev', 12_890, 'EXPENSE:UTILITIES', 'Internet and phone')
  const wrong = spend(5, 'u-maya', 6_400, 'EXPENSE:FUN', 'Concert tickets (wrong card)')
  backend.post(
    h,
    'REVERSAL',
    'Reversal of: Concert tickets (wrong card) (booked twice)',
    'u-maya',
    wrong.postings.map((p) => ({
      code: [...h.accounts].find((a) => a.id === p.accountId)!.code,
      amount: -p.amountMinor,
    })),
    ago(5, -1),
    { reversesEntryId: wrong.id },
  )
  move(4, 'ALLOWANCE', 'u-maya', 'u-ada', 1_000, 'Weekly allowance for Ada')
  deposit(3, 'u-maya', 30_000, 'Garage sale proceeds')

  const rejected = backend.createApproval(
    h,
    'u-sam',
    'Gaming laptop',
    25_000,
    ago(3),
    POOL,
    EXPENSE_GENERAL,
  )
  Object.assign(rejected, {
    status: 'REJECTED',
    decidedByUid: 'u-dev',
    decidedAt: ago(2, 20).toISOString(),
    decisionNote: 'Let us budget this for the holidays instead.',
  })
  backend.createApproval(
    h,
    'u-sam',
    'Winter coats for the kids',
    18_000,
    ago(0, 5),
    POOL,
    EXPENSE_GENERAL,
  )

  const addSchedule = (
    to: string,
    amountMinor: number,
    frequency: Frequency,
    startDaysAgo: number,
    description: string,
    nextDueOn: string,
    runs: AllowanceRun[],
  ) => {
    const schedule: ScheduleView = {
      id: backend.nextId(),
      fromAccountId: accountByCode(h, POOL).id,
      toAccountId: accountByCode(h, `POT:${to}`).id,
      amountMinor,
      currency: 'USD',
      frequency,
      startDate: dateOnly(ago(startDaysAgo)),
      nextDueOn,
      active: true,
      description,
    }
    h.schedules.push(schedule)
    h.runs.set(schedule.id, runs)
  }
  const adaStart = dateOnly(ago(25))
  addSchedule(
    'u-ada',
    1_000,
    'WEEKLY',
    25,
    'Weekly allowance for Ada',
    dateOnly(new Date(now.getTime() + 3 * DAY)),
    [
      { periodStart: adaStart, status: 'PAID' },
      { periodStart: dateOnly(ago(18)), status: 'SKIPPED' },
      { periodStart: dateOnly(ago(11)), status: 'SKIPPED' },
      { periodStart: dateOnly(ago(4)), status: 'PAID' },
    ],
  )
  const samStart = dateOnly(ago(35))
  addSchedule('u-sam', 2_500, 'MONTHLY', 35, 'Sam monthly allowance', addMonthsUtc(samStart, 2), [
    { periodStart: samStart, status: 'PAID' },
    { periodStart: addMonthsUtc(samStart, 1), status: 'FAILED' },
  ])

  // A second, small household in another currency: shows the household switcher and non-USD formatting.
  const trip = backend.createHousehold({
    name: DEMO_TRIP,
    currency: 'EUR',
    ownerUid: 'u-maya',
    ownerName: 'Maya Okafor',
    approvalThresholdMinor: null,
    createdAt: ago(20),
  })
  backend.addMember(trip, 'u-dev', 'MEMBER', 'Dev Okafor')
  backend.addAccount(trip, null, 'EXPENSE:TRAVEL', 'Travel', 'EXPENSE', 'EUR', false)
  backend.post(
    trip,
    'DEPOSIT',
    'Flights fund',
    'u-maya',
    [
      { code: POOL, amount: 60_000 },
      { code: income, amount: -60_000 },
    ],
    ago(19),
  )
  backend.post(
    trip,
    'DEPOSIT',
    'Dev contribution',
    'u-dev',
    [
      { code: POOL, amount: 25_000 },
      { code: income, amount: -25_000 },
    ],
    ago(12),
  )
  backend.post(
    trip,
    'SPEND',
    'Hostel deposit',
    'u-maya',
    [
      { code: POOL, amount: -8_990 },
      { code: 'EXPENSE:TRAVEL', amount: 8_990 },
    ],
    ago(6),
  )
}
