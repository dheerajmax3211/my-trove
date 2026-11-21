import { describe, expect, it } from 'vitest'
import type { Item } from '../api/types'
import { buildSchedule, defaultPlan, dueState, estimateNextStep, validatePlan } from './schedule'

const item = (over: Partial<Item> = {}): Item => ({
  id: 'x',
  title: 't',
  counterparty: 'c',
  counterpartyEmail: null,
  category: 'REFUND',
  amount: null,
  currency: null,
  expectedBy: '2026-11-19',
  status: 'OPEN',
  outcome: null,
  replyAddress: 'waiting+a@b.c',
  plan: { nudgeAfterDays: 5, escalateAfterDays: 14, finalNoticeAfterDays: 28, expireAfterDays: 60 },
  createdAt: '2026-11-01T12:00:00.000Z',
  updatedAt: '2026-11-01T12:00:00.000Z',
  closedAt: null,
  followUp: null,
  ...over,
})

describe('defaultPlan (mirrors the service defaults)', () => {
  it('offsets every stage from the expected date', () => {
    expect(defaultPlan('REFUND', 10)).toEqual({
      nudgeAfterDays: 13,
      escalateAfterDays: 20,
      finalNoticeAfterDays: 31,
      expireAfterDays: 55,
    })
  })

  it('clamps overdue items to day 0 and far-future dates to 365 days', () => {
    expect(defaultPlan('DELIVERY', -30).nudgeAfterDays).toBe(2)
    expect(defaultPlan('DELIVERY', 5000).nudgeAfterDays).toBe(367)
  })

  it('has no final notice for the OTHER category', () => {
    expect(defaultPlan('OTHER', 0)).toEqual({
      nudgeAfterDays: 5,
      escalateAfterDays: 14,
      finalNoticeAfterDays: 0,
      expireAfterDays: 45,
    })
  })

  it.each(['REFUND', 'CLAIM', 'REIMBURSEMENT', 'APPROVAL', 'DELIVERY', 'OTHER'] as const)(
    'produces a valid plan for %s',
    (category) => {
      expect(validatePlan(defaultPlan(category, 12))).toEqual({})
    },
  )
})

describe('validatePlan', () => {
  const ok = {
    nudgeAfterDays: 3,
    escalateAfterDays: 7,
    finalNoticeAfterDays: 14,
    expireAfterDays: 30,
  }

  it('accepts a well-ordered plan, with or without a final notice', () => {
    expect(validatePlan(ok)).toEqual({})
    expect(validatePlan({ ...ok, finalNoticeAfterDays: 0 })).toEqual({})
  })

  it('reports each broken rule on its own field', () => {
    expect(validatePlan({ ...ok, nudgeAfterDays: 0 }).nudgeAfterDays).toBeDefined()
    expect(validatePlan({ ...ok, escalateAfterDays: 3 }).escalateAfterDays).toBeDefined()
    expect(validatePlan({ ...ok, finalNoticeAfterDays: 7 }).finalNoticeAfterDays).toBeDefined()
    expect(validatePlan({ ...ok, expireAfterDays: 14 }).expireAfterDays).toBeDefined()
    expect(validatePlan({ ...ok, nudgeAfterDays: Number.NaN }).nudgeAfterDays).toBeDefined()
  })
})

describe('buildSchedule', () => {
  const start = new Date(2026, 10, 19)

  it('lists nudge, escalation, final notice and expiry with calendar dates', () => {
    const steps = buildSchedule(ok(), start)
    expect(steps.map((s) => s.key)).toEqual(['nudge', 'escalate', 'finalNotice', 'expire'])
    expect(steps[0]?.date.getDate()).toBe(24)
    expect(steps[0]?.day).toBe(5)
  })

  it('leaves out the final notice when the plan has none', () => {
    const steps = buildSchedule({ ...ok(), finalNoticeAfterDays: 0 }, start)
    expect(steps.map((s) => s.key)).toEqual(['nudge', 'escalate', 'expire'])
  })

  function ok() {
    return item().plan
  }
})

describe('estimateNextStep', () => {
  const now = new Date('2026-11-19T12:00:00Z')

  it('follows the plan for the current status', () => {
    expect(estimateNextStep(item({ status: 'OPEN' }), now)?.action).toBe('NUDGE')
    expect(estimateNextStep(item({ status: 'NUDGED' }), now)?.action).toBe('ESCALATE')
  })

  it('moves from final notice to expiry once the final notice date has passed', () => {
    const escalated = item({ status: 'ESCALATED' })
    expect(estimateNextStep(escalated, new Date('2026-11-20T00:00:00Z'))?.action).toBe(
      'FINAL_NOTICE',
    )
    expect(estimateNextStep(escalated, new Date('2026-12-30T00:00:00Z'))?.action).toBe('EXPIRE')
  })

  it('goes straight to expiry when there is no final notice', () => {
    const plan = {
      nudgeAfterDays: 5,
      escalateAfterDays: 14,
      finalNoticeAfterDays: 0,
      expireAfterDays: 45,
    }
    expect(estimateNextStep(item({ status: 'ESCALATED', plan }), now)?.action).toBe('EXPIRE')
  })

  it('has nothing for closed items', () => {
    expect(estimateNextStep(item({ status: 'RESOLVED' }), now)).toBeNull()
  })
})

describe('dueState', () => {
  const now = new Date(2026, 10, 19, 15)

  it('flags active items past their expected date as overdue', () => {
    expect(dueState(item({ expectedBy: '2026-11-10' }), now)).toEqual({ kind: 'overdue', days: 9 })
  })

  it('distinguishes today and upcoming', () => {
    expect(dueState(item({ expectedBy: '2026-11-19' }), now)).toEqual({ kind: 'today' })
    expect(dueState(item({ expectedBy: '2026-11-22' }), now)).toEqual({ kind: 'upcoming', days: 3 })
  })

  it('never flags closed items', () => {
    expect(dueState(item({ status: 'RESOLVED', expectedBy: '2026-01-01' }), now)).toBeNull()
  })
})
