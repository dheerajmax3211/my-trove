import { describe, expect, it } from 'vitest'
import { describeRecurrence } from './recurrence'
import { validateReminder, type ReminderForm } from './validate'

const form = (over: Partial<ReminderForm> = {}): ReminderForm => ({
  title: 'Pay rent',
  due: '2026-12-01T09:00',
  repeat: 'NONE',
  interval: '1',
  ...over,
})

describe('describeRecurrence', () => {
  it('reads naturally for one-offs, singular and plural intervals', () => {
    expect(describeRecurrence(null)).toBe('Does not repeat')
    expect(describeRecurrence({ unit: 'DAILY', interval: 1 })).toBe('Every day')
    expect(describeRecurrence({ unit: 'WEEKLY', interval: 2 })).toBe('Every 2 weeks')
    expect(describeRecurrence({ unit: 'MONTHLY', interval: 3 })).toBe('Every 3 months')
  })
})

describe('validateReminder', () => {
  it('builds the request input with an ISO instant and trimmed title', () => {
    const { errors, input } = validateReminder(form({ title: '  Pay rent  ' }))
    expect(errors).toEqual({})
    expect(input).toEqual({
      title: 'Pay rent',
      dueAt: new Date('2026-12-01T09:00').toISOString(),
      recurrence: null,
    })
  })
  it('includes the recurrence when repeating', () => {
    expect(validateReminder(form({ repeat: 'WEEKLY', interval: '2' })).input?.recurrence).toEqual({
      unit: 'WEEKLY',
      interval: 2,
    })
  })
  it('reports each problem on its own field', () => {
    const { errors, input } = validateReminder(
      form({ title: ' ', due: '', repeat: 'DAILY', interval: '0' }),
    )
    expect(input).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['due', 'interval', 'title'])
  })
  it('limits the title and interval like the server', () => {
    expect(validateReminder(form({ title: 'x'.repeat(301) })).errors.title).toMatch(/300/)
    expect(validateReminder(form({ repeat: 'DAILY', interval: '366' })).errors.interval).toMatch(
      /365/,
    )
    expect(
      validateReminder(form({ repeat: 'DAILY', interval: '1.5' })).errors.interval,
    ).toBeDefined()
  })
  it('ignores the interval when the reminder does not repeat', () => {
    expect(validateReminder(form({ interval: 'abc' })).errors).toEqual({})
  })
})
