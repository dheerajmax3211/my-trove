import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Input } from '../Input/Input'
import { Select } from '../Select/Select'
import { Textarea } from '../Textarea/Textarea'
import { Field } from './Field'

describe('Field + controls', () => {
  it('labels the control and describes it with the hint', () => {
    render(
      <Field label="Email" description="We never share it.">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAccessibleDescription('We never share it.')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('marks the control invalid and announces the error when `error` is set', () => {
    render(
      <Field label="Email" description="Hint" error="Enter a valid address">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Hint Enter a valid address')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid address')
  })

  it('exposes required via aria-required and a visual marker hidden from AT', () => {
    render(
      <Field label="Name" required>
        <Input />
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-required', 'true')
  })

  it('disables the control through the field', () => {
    render(
      <Field label="Locked" disabled>
        <Input />
      </Field>,
    )
    expect(screen.getByLabelText('Locked')).toBeDisabled()
  })

  it('can hide the label visually while keeping it accessible', () => {
    render(
      <Field label="Search" hideLabel>
        <Input />
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeInTheDocument()
  })

  it('works with Textarea and Select too', async () => {
    render(
      <>
        <Field label="Notes" error="Too short">
          <Textarea />
        </Field>
        <Field label="Plan">
          <Select placeholder="Choose a plan">
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </Select>
        </Field>
      </>,
    )
    expect(screen.getByLabelText('Notes')).toHaveAttribute('aria-invalid', 'true')
    const select = screen.getByLabelText('Plan')
    expect(select).toHaveValue('')
    await userEvent.selectOptions(select, 'pro')
    expect(select).toHaveValue('pro')
  })

  it('Input accepts typing and standalone invalid prop', async () => {
    render(<Input aria-label="Standalone" invalid />)
    const input = screen.getByLabelText('Standalone')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await userEvent.type(input, 'hello')
    expect(input).toHaveValue('hello')
  })
})
