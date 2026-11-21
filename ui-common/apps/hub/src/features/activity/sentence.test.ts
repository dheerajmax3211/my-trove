import { describe, expect, it } from 'vitest'
import { groupEventsByDay } from './pages/ActivityPage'
import { describeEvent } from './sentence'
import type { AuditEvent } from './types'

const nameOf = (uid: string) => (uid === 'me' ? 'You' : uid === 'ana' ? 'Ana' : `Member ${uid}`)

const event = (
  action: string,
  details: Record<string, unknown> = {},
  extra: Partial<AuditEvent> = {},
): AuditEvent => ({
  id: action,
  actorUid: 'ana',
  householdId: 'h1',
  action,
  subjectType: 'x',
  subjectId: 's1',
  details,
  createdAt: '2026-11-19T09:00:00Z',
  ...extra,
})

describe('describeEvent', () => {
  it('says who did what in a sentence', () => {
    expect(describeEvent(event('reminder.created', { title: 'Call mum' }), nameOf)).toMatchObject({
      title: 'Ana added a reminder',
      description: 'Call mum',
      kind: 'reminder',
    })
    expect(describeEvent(event('reminder.created', {}, { actorUid: 'me' }), nameOf).title).toBe(
      'You added a reminder',
    )
  })

  it('reads a file with its size', () => {
    expect(
      describeEvent(event('file.uploaded', { name: 'deed.pdf', sizeBytes: 2048 }), nameOf),
    ).toMatchObject({ title: 'Ana added a file', description: 'deed.pdf (2 KB)', kind: 'file' })
  })

  it('names the other person in membership events', () => {
    expect(describeEvent(event('member.removed', {}, { subjectId: 'bob' }), nameOf).title).toBe(
      'Ana removed Member bob from the household',
    )
    expect(
      describeEvent(event('member.role_changed', { from: 'MEMBER', to: 'OWNER' }), nameOf).title,
    ).toBe('Ana made Member s1 an owner')
    expect(describeEvent(event('member.joined', { role: 'MEMBER' }), nameOf)).toMatchObject({
      title: 'Ana joined the household',
      description: 'As a member',
    })
  })

  it('covers every action the service records, each with a kind and a tone', () => {
    const actions = [
      'household.created',
      'household.deleted',
      'invite.created',
      'invite.revoked',
      'member.joined',
      'member.left',
      'member.removed',
      'member.role_changed',
      'reminder.created',
      'reminder.updated',
      'reminder.cancelled',
      'file.uploaded',
      'file.deleted',
      'file.download_link_issued',
    ]
    for (const action of actions) {
      const sentence = describeEvent(event(action), nameOf)
      expect(sentence.title.startsWith('Ana ')).toBe(true)
      expect(sentence.kind).toBeTruthy()
      expect(sentence.tone).toBeTruthy()
    }
  })

  it('never hides an action it does not know', () => {
    expect(describeEvent(event('widget.polished'), nameOf).title).toBe('Ana: widget.polished')
  })
})

describe('groupEventsByDay', () => {
  const now = new Date(2026, 10, 19, 12).getTime()
  const at = (day: number, hour: number): AuditEvent =>
    event(
      'reminder.created',
      {},
      { id: `${day}-${hour}`, createdAt: new Date(2026, 10, day, hour).toISOString() },
    )

  it('starts a new group when the day changes and keeps newest first', () => {
    const groups = groupEventsByDay([at(19, 10), at(19, 8), at(18, 20), at(12, 9), at(12, 8)], now)
    expect(groups.map((g) => [g.label, g.events.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
      [expect.stringMatching(/12/), 2],
    ])
  })
  it('is empty for no events', () => {
    expect(groupEventsByDay([], now)).toEqual([])
  })
})
