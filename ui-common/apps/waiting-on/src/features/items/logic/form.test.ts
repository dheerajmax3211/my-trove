import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  effectivePlan,
  emptyValues,
  hasErrors,
  toCreateInput,
  validateNewItem,
  type NewItemValues,
} from './form'

const valid = (over: Partial<NewItemValues> = {}): NewItemValues => ({
  ...emptyValues(),
  title: '  Refund for jacket ',
  counterparty: 'Northwind',
  category: 'REFUND',
  expectedBy: '2026-11-26',
  ...over,
})

describe('validateNewItem', () => {
  it('accepts the minimum a user must provide', () => {
    expect(hasErrors(validateNewItem(valid()))).toBe(false)
  })

  it('requires title, counterparty, category and expected date', () => {
    const errors = validateNewItem(emptyValues())
    expect(Object.keys(errors).sort()).toEqual(['category', 'counterparty', 'expectedBy', 'title'])
  })

  it('checks length limits, email shape and amount precision', () => {
    const errors = validateNewItem(
      valid({ title: 'x'.repeat(201), counterpartyEmail: 'nope', amount: '12.345' }),
    )
    expect(errors.title).toBeDefined()
    expect(errors.counterpartyEmail).toBeDefined()
    expect(errors.amount).toBeDefined()
  })

  it('rejects an impossible calendar date', () => {
    expect(validateNewItem(valid({ expectedBy: '2026-02-31' })).expectedBy).toBeDefined()
  })

  it('validates a customised plan only when customising', () => {
    const plan = {
      nudgeAfterDays: '5',
      escalateAfterDays: '5',
      finalNoticeAfterDays: '0',
      expireAfterDays: '60',
    }
    expect(validateNewItem(valid({ plan })).plan).toBeUndefined()
    expect(validateNewItem(valid({ plan, customise: true })).plan?.escalateAfterDays).toBeDefined()
  })
})

describe('toCreateInput', () => {
  it('trims text and omits every optional part that is empty', () => {
    expect(toCreateInput(valid())).toEqual({
      title: 'Refund for jacket',
      counterparty: 'Northwind',
      category: 'REFUND',
      expectedBy: '2026-11-26',
    })
  })

  it('sends amount as a number together with its currency, and a custom plan', () => {
    const input = toCreateInput(
      valid({
        counterpartyEmail: ' help@northwind.example ',
        amount: '129.99',
        currency: 'EUR',
        customise: true,
        plan: {
          nudgeAfterDays: '4',
          escalateAfterDays: '9',
          finalNoticeAfterDays: '0',
          expireAfterDays: '30',
        },
      }),
    )
    expect(input).toMatchObject({
      counterpartyEmail: 'help@northwind.example',
      amount: 129.99,
      currency: 'EUR',
      plan: {
        nudgeAfterDays: 4,
        escalateAfterDays: 9,
        finalNoticeAfterDays: 0,
        expireAfterDays: 30,
      },
    })
  })
})

describe('effectivePlan', () => {
  const today = new Date(2026, 10, 19)

  it('uses the category default measured from the expected date', () => {
    expect(daysUntil('2026-11-26', today)).toBe(7)
    expect(effectivePlan(valid(), today)?.nudgeAfterDays).toBe(10)
  })

  it('is unknown until category and date are chosen', () => {
    expect(effectivePlan(emptyValues(), today)).toBeNull()
  })
})
