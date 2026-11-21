import { describe, expect, it } from 'vitest'
import {
  EMPTY_FORM,
  toFormValues,
  toInput,
  validateForm,
  type ApplianceFormValues,
} from './formState'
import type { Appliance } from './types'

const valid: ApplianceFormValues = { ...EMPTY_FORM, name: 'Kitchen fridge', type: 'FRIDGE' }

describe('validateForm', () => {
  it('accepts the minimum: a name and a type', () => {
    expect(validateForm(valid)).toEqual({})
  })

  it('requires a name and a type', () => {
    expect(validateForm(EMPTY_FORM)).toEqual({
      name: 'Enter a name for the appliance.',
      type: 'Choose a type.',
    })
    expect(validateForm({ ...valid, name: '   ' }).name).toBeDefined()
  })

  it('enforces the length limits of the service', () => {
    expect(validateForm({ ...valid, name: 'x'.repeat(121) }).name).toMatch(/120/)
    expect(validateForm({ ...valid, name: 'x'.repeat(120) }).name).toBeUndefined()
    expect(validateForm({ ...valid, location: 'x'.repeat(121) }).location).toBeDefined()
    expect(validateForm({ ...valid, notes: 'x'.repeat(2001) }).notes).toBeDefined()
  })

  it('checks that dates are in a sensible order, and only when both are present', () => {
    expect(
      validateForm({ ...valid, purchaseDate: '2026-05-01', warrantyEndDate: '2026-04-30' })
        .warrantyEndDate,
    ).toBeDefined()
    expect(
      validateForm({ ...valid, purchaseDate: '2026-05-01', warrantyEndDate: '2026-05-01' }),
    ).toEqual({})
    expect(
      validateForm({ ...valid, lastServiceDate: '2026-05-01', nextServiceDate: '2026-04-01' })
        .nextServiceDate,
    ).toBeDefined()
    expect(validateForm({ ...valid, warrantyEndDate: '2020-01-01' })).toEqual({})
  })
})

describe('toInput', () => {
  it('trims text and sends empty optional fields as null, so clearing a date clears it', () => {
    expect(
      toInput({
        ...valid,
        name: '  Kitchen fridge ',
        location: '  ',
        warrantyEndDate: '2027-01-01',
      }),
    ).toEqual({
      name: 'Kitchen fridge',
      type: 'FRIDGE',
      location: null,
      purchaseDate: null,
      warrantyEndDate: '2027-01-01',
      lastServiceDate: null,
      nextServiceDate: null,
      notes: null,
    })
  })

  it('refuses a form without a type', () => {
    expect(() => toInput(EMPTY_FORM)).toThrow()
  })
})

describe('toFormValues', () => {
  it('turns nulls into empty strings for the inputs', () => {
    const appliance = {
      name: 'AC',
      type: 'AIR_CONDITIONER',
      location: null,
      purchaseDate: '2024-01-01',
      warrantyEndDate: null,
      lastServiceDate: null,
      nextServiceDate: null,
      notes: null,
    } as Appliance
    expect(toFormValues(appliance)).toEqual({
      name: 'AC',
      type: 'AIR_CONDITIONER',
      location: '',
      purchaseDate: '2024-01-01',
      warrantyEndDate: '',
      lastServiceDate: '',
      nextServiceDate: '',
      notes: '',
    })
  })
})
