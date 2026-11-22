import { describe, expect, it } from 'vitest'
import { classifyReply } from './reply'

describe('demo reply classifier (stand-in for the service rules)', () => {
  it.each([
    ['Your refund has been processed and will arrive in 3 days.', 'PAID'],
    ['Good news: the claim was approved.', 'PAID'],
    ['We regret to inform you that your request was declined.', 'REJECTED'],
    ['Please send a copy of the invoice.', 'NEEDS_INFO'],
    ['We need additional information before we can decide.', 'NEEDS_INFO'],
    ['Your refund has not been processed yet.', 'UNKNOWN'],
    ['The refund will be issued next week.', 'UNKNOWN'],
    ['Out of office until Monday.', 'UNKNOWN'],
  ])('reads %j as %s', (text, expected) => {
    expect(classifyReply(text)).toBe(expected)
  })
})
