import { describe, expect, it } from 'vitest'
import { demoSeed } from '../../../mock/seed'
import { NOW } from '../../../testing/harness'
import { groupItems, headline, nextFollowUp, summarize, whenLabel } from './groups'

const items = demoSeed(NOW)
  .filter((e) => e.item.ownerUid === 'demo-user')
  .map((e) => ({ ...e.item, replyAddress: 'x', followUp: null }))
  // the service answers oldest expected date first
  .sort((a, b) => a.expectedBy.localeCompare(b.expectedBy))

describe('groupItems', () => {
  it('splits by urgency and keeps the service order inside a group', () => {
    const groups = groupItems(items, NOW)
    expect(groups.overdue.map((i) => i.title)).toEqual([
      'Water damage claim #88213',
      'Refund for returned jacket',
      'Standing desk order #5521',
    ])
    expect(groups.soon.map((i) => i.title)).toEqual(['Conference travel expenses'])
    expect(groups.later.map((i) => i.title)).toEqual(['Visa renewal decision'])
    expect(groups.closed.map((i) => i.title).sort()).toEqual([
      'Deposit return from old flat',
      'Parking permit renewal',
      'Warranty replacement for headphones',
    ])
  })
})

describe('summary', () => {
  const active = items.filter((i) => ['OPEN', 'NUDGED', 'ESCALATED'].includes(i.status))

  it('counts open and overdue items and finds the next follow-up', () => {
    const s = summarize(active, NOW)
    expect(s.open).toBe(5)
    expect(s.overdue).toBe(3)
    // the desk order is nudged today; expiry is never a follow-up
    expect(s.next?.item.title).toBe('Standing desk order #5521')
    expect(s.next?.action).toBe('NUDGE')
    expect(s.next?.inDays).toBe(0)
  })

  it('has no next follow-up when nothing is scheduled', () => {
    expect(nextFollowUp([], NOW)).toBeNull()
  })

  it('says how things stand in words', () => {
    const none = null
    expect(headline({ open: 0, overdue: 0, next: none })).toBe('Nothing is waiting on anyone.')
    expect(headline({ open: 3, overdue: 0, next: none })).toBe(
      'Nothing is overdue. 3 items are waiting.',
    )
    expect(headline({ open: 1, overdue: 0, next: none })).toBe(
      'Nothing is overdue. One item is waiting.',
    )
    expect(headline({ open: 1, overdue: 1, next: none })).toBe(
      'Your one item is past its expected date.',
    )
    expect(headline({ open: 4, overdue: 4, next: none })).toBe(
      'All 4 items are past their expected date.',
    )
    expect(headline({ open: 5, overdue: 1, next: none })).toBe(
      '1 of 5 items is past its expected date.',
    )
    expect(headline({ open: 5, overdue: 3, next: none })).toBe(
      '3 of 5 items are past their expected date.',
    )
  })

  it('labels the day', () => {
    expect([whenLabel(0), whenLabel(1), whenLabel(4)]).toEqual(['Today', 'Tomorrow', 'In 4 days'])
  })
})
