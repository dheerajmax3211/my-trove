import { addDays, toCalendarDate } from '../lib/dates'
import type { EventType, ItemCategory, ItemStatus, Plan, Stage } from '../features/items/api/types'
import { defaultPlan } from '../features/items/logic/schedule'
import { MOCK_USER_UID, type SeedEntry, type StoredEvent, type StoredItem } from './backend'

/** Id of an item owned by someone else: requesting it must look exactly like a missing item. */
export const OTHER_USERS_ITEM_ID = '00000000-0000-4000-8000-000000000255'

interface SeedSpec {
  n: number
  title: string
  counterparty: string
  email?: string
  category: ItemCategory
  amount?: [number, string]
  /** Days relative to today (negative = already past). */
  expectedInDays: number
  createdDaysAgo: number
  status: ItemStatus
  stage: Stage
  outcome?: string
  closedDaysAgo?: number
  snoozedDays?: number
  plan?: Plan
  /** Timeline entries as [days ago, type, summary, detail]. */
  events: [number, EventType, string, string | null][]
  owner?: string
}

const pad = (n: number) => String(n).padStart(12, '0')

function build(now: Date, spec: SeedSpec): SeedEntry {
  const created = addDays(now, -spec.createdDaysAgo)
  const expected = toCalendarDate(addDays(now, spec.expectedInDays))
  const plan = spec.plan ?? defaultPlan(spec.category, spec.expectedInDays + spec.createdDaysAgo)
  const id = `00000000-0000-4000-8000-${pad(spec.n)}`
  const closed =
    spec.closedDaysAgo === undefined ? null : addDays(now, -spec.closedDaysAgo).toISOString()
  const item: StoredItem = {
    id,
    ownerUid: spec.owner ?? MOCK_USER_UID,
    title: spec.title,
    counterparty: spec.counterparty,
    counterpartyEmail: spec.email ?? null,
    category: spec.category,
    amount: spec.amount?.[0] ?? null,
    currency: spec.amount?.[1] ?? null,
    expectedBy: expected,
    status: spec.status,
    outcome: spec.outcome ?? null,
    replyToken: `b${pad(spec.n)}0000000`.slice(0, 20),
    stage: spec.stage,
    snoozedDays: spec.snoozedDays ?? 0,
    plan,
    createdAt: created.toISOString(),
    updatedAt: closed ?? addDays(now, -(spec.events.at(-1)?.[0] ?? 0)).toISOString(),
    closedAt: closed,
  }
  const events: StoredEvent[] = spec.events.map(([daysAgo, type, summary, detail], index) => ({
    id: `e0000000-0000-4000-8000-${pad(spec.n * 10 + index)}`,
    itemId: id,
    type,
    summary,
    detail,
    occurredAt: addDays(now, -daysAgo).toISOString(),
  }))
  return { item, events }
}

const started = (title: string, who: string, days: number): [number, EventType, string, string] => [
  days,
  'CREATED',
  `Now waiting on ${who} for: ${title}`,
  'Follow-ups are scheduled from the expected date.',
]

/** A handful of items in every state, relative to `now`, so the demo shows the whole product at once. */
export function demoSeed(now: Date): SeedEntry[] {
  const specs: SeedSpec[] = [
    {
      n: 1,
      title: 'Refund for returned jacket',
      counterparty: 'Northwind Outfitters',
      email: 'support@northwind.example',
      category: 'REFUND',
      amount: [129.99, 'USD'],
      expectedInDays: -8,
      createdDaysAgo: 20,
      status: 'NUDGED',
      stage: 'NUDGED',
      events: [
        started('Refund for returned jacket', 'Northwind Outfitters', 20),
        [
          5,
          'NUDGE_SENT',
          'Friendly nudge prepared for Northwind Outfitters',
          'Following up: Refund for returned jacket',
        ],
      ],
    },
    {
      n: 2,
      title: 'Water damage claim #88213',
      counterparty: 'Harbour Mutual Insurance',
      category: 'CLAIM',
      amount: [2400, 'GBP'],
      expectedInDays: -40,
      createdDaysAgo: 52,
      status: 'ESCALATED',
      stage: 'ESCALATED',
      snoozedDays: 7,
      events: [
        started('Water damage claim #88213', 'Harbour Mutual Insurance', 52),
        [
          38,
          'NUDGE_SENT',
          'Friendly nudge prepared for Harbour Mutual Insurance',
          'Following up: Water damage claim #88213',
        ],
        [30, 'SNOOZED', 'Follow-ups postponed by 7 day(s)', null],
        [
          12,
          'REPLY_RECEIVED',
          'Reply received (classified: NEEDS_INFO)',
          'We need the repair invoice before we can proceed.',
        ],
        [
          3,
          'ESCALATION_DRAFTED',
          'Escalation letter drafted for Harbour Mutual Insurance',
          'FORMAL COMPLAINT AND REQUEST FOR ACTION\n\nDear Harbour Mutual Insurance,\n\nRe: Water damage claim #88213\n\nI am writing to formally escalate an unresolved matter.',
        ],
      ],
    },
    {
      n: 3,
      title: 'Conference travel expenses',
      counterparty: 'Finance team at Acme Corp',
      email: 'expenses@acme.example',
      category: 'REIMBURSEMENT',
      amount: [842.1, 'USD'],
      expectedInDays: 5,
      createdDaysAgo: 4,
      status: 'OPEN',
      stage: 'AWAITING_NUDGE',
      events: [started('Conference travel expenses', 'Finance team at Acme Corp', 4)],
    },
    {
      n: 4,
      title: 'Standing desk order #5521',
      counterparty: 'Oak and Ash Furniture',
      category: 'DELIVERY',
      amount: [489, 'USD'],
      expectedInDays: -2,
      createdDaysAgo: 16,
      status: 'OPEN',
      stage: 'AWAITING_NUDGE',
      events: [started('Standing desk order #5521', 'Oak and Ash Furniture', 16)],
    },
    {
      n: 5,
      title: 'Parking permit renewal',
      counterparty: 'City Council permits office',
      category: 'APPROVAL',
      expectedInDays: -20,
      createdDaysAgo: 34,
      status: 'RESOLVED',
      stage: 'RESOLVED',
      outcome: 'Approved. The permit arrives by post this week.',
      closedDaysAgo: 9,
      events: [
        started('Parking permit renewal', 'City Council permits office', 34),
        [9, 'RESOLVED', 'Marked as resolved', 'Approved. The permit arrives by post this week.'],
      ],
    },
    {
      n: 6,
      title: 'Deposit return from old flat',
      counterparty: 'Brightside Lettings',
      category: 'OTHER',
      amount: [1200, 'GBP'],
      expectedInDays: -70,
      createdDaysAgo: 80,
      status: 'EXPIRED',
      stage: 'EXPIRED',
      outcome: 'No answer after all follow-ups',
      closedDaysAgo: 5,
      events: [
        started('Deposit return from old flat', 'Brightside Lettings', 80),
        [5, 'EXPIRED', 'No answer after all follow-ups', null],
      ],
    },
    {
      n: 7,
      title: 'Warranty replacement for headphones',
      counterparty: 'SoundWorks',
      category: 'CLAIM',
      expectedInDays: -12,
      createdDaysAgo: 18,
      status: 'CANCELLED',
      stage: 'CANCELLED',
      outcome: 'Cancelled by owner',
      closedDaysAgo: 10,
      events: [
        started('Warranty replacement for headphones', 'SoundWorks', 18),
        [10, 'CANCELLED', 'Tracking cancelled', 'Cancelled by owner'],
      ],
    },
    {
      n: 255,
      title: "Somebody else's refund",
      counterparty: 'Not yours',
      category: 'REFUND',
      expectedInDays: 3,
      createdDaysAgo: 2,
      status: 'OPEN',
      stage: 'AWAITING_NUDGE',
      owner: 'other-user',
      events: [started("Somebody else's refund", 'Not yours', 2)],
    },
  ]
  return specs.map((spec) => build(now, spec))
}
