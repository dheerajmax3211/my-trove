import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Field } from '../components/Field/Field'
import { Input } from '../components/Input/Input'
import { Select } from '../components/Select/Select'
import { Textarea } from '../components/Textarea/Textarea'
import { FileDrop } from './FileDrop'
import { Form, FormActions, FormGrid, FormSection } from './Form'

describe('Field variants and states', () => {
  it('floating labels still name the control and sit inside the control wrapper', () => {
    render(
      <Field label="Email" variant="floating">
        <Input />
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: 'Email' })
    // A single-space placeholder is what lets CSS detect "has a value" for the lifted label.
    expect(input).toHaveAttribute('placeholder', ' ')
  })

  it('floating works for Textarea and Select too', () => {
    render(
      <>
        <Field label="Note" variant="floating">
          <Textarea />
        </Field>
        <Field label="Duration" variant="floating">
          <Select>
            <option>1 day</option>
          </Select>
        </Field>
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Note' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Duration' })).toBeInTheDocument()
  })

  it('shows a success state with a message that is read out of band, not as an alert', () => {
    render(
      <Field label="Name" success="Looks good">
        <Input />
      </Field>,
    )
    expect(screen.getByText('Looks good')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('errors still announce (role=alert) and invalidate the control', () => {
    render(
      <Field label="Name" error="Enter a name" variant="floating">
        <Input />
      </Field>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows a hint beside the label', () => {
    render(
      <Field label="Note" hint="0 / 200">
        <Textarea />
      </Field>,
    )
    expect(screen.getByText('0 / 200')).toBeInTheDocument()
  })

  it('Input adornments are decorative (leading) and operable (trailing)', async () => {
    const onClear = vi.fn()
    render(
      <Field label="Search">
        <Input
          leading={<svg data-testid="glass" />}
          trailing={
            <button type="button" onClick={onClear}>
              Clear
            </button>
          }
        />
      </Field>,
    )
    expect(screen.getByTestId('glass').closest('[aria-hidden="true"]')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})

describe('Form, FormSection, FormGrid, FormActions', () => {
  it('sections are regions named by their heading', () => {
    render(
      <Form aria-label="Lend">
        <FormSection title="Who is it for" description="They get an email.">
          <FormGrid>
            <Field label="Name">
              <Input />
            </Field>
          </FormGrid>
        </FormSection>
      </Form>,
    )
    const region = screen.getByRole('region', { name: 'Who is it for' })
    expect(within(region).getByRole('heading', { level: 2 })).toBeInTheDocument()
    expect(within(region).getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
    expect(screen.getByText('They get an email.')).toBeInTheDocument()
  })

  it('the action bar is hidden from assistive tech while it has nothing to save', () => {
    const { rerender } = render(
      <FormActions visible={false} status="Unsaved">
        <button type="submit">Save</button>
      </FormActions>,
    )
    expect(screen.getByText('Save').closest('[aria-hidden="true"]')).toBeInTheDocument()
    rerender(
      <FormActions visible status="Unsaved">
        <button type="submit">Save</button>
      </FormActions>,
    )
    expect(screen.getByRole('button', { name: 'Save' }).closest('[aria-hidden="true"]')).toBeNull()
    expect(screen.getByText('Unsaved')).toHaveAttribute('aria-live', 'polite')
  })
})

function file(name: string, type: string, size = 100): File {
  const f = new File(['x'.repeat(10)], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('FileDrop', () => {
  it('is a real, labelled file input inside a Field', () => {
    render(
      <Field label="Supporting files" description="PDF only">
        <FileDrop accept=".pdf" />
      </Field>,
    )
    const input = screen.getByLabelText<HTMLInputElement>('Supporting files')
    expect(input.type).toBe('file')
    expect(input).toHaveAccessibleDescription('PDF only')
  })

  it('accepts files from the picker, lists them and removes them', async () => {
    const onFilesChange = vi.fn()
    render(<FileDrop multiple onFilesChange={onFilesChange} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, [file('a.pdf', 'application/pdf'), file('b.png', 'image/png')])
    const list = screen.getByRole('list', { name: 'Selected files' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Remove a.pdf' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(onFilesChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'b.png' })])
  })

  it('rejects the wrong type and oversize files with a message that says why', async () => {
    render(<FileDrop accept=".pdf" maxSize={1000} multiple />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent
      .setup({ applyAccept: false })
      .upload(input, [file('photo.png', 'image/png'), file('big.pdf', 'application/pdf', 5000)])
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('photo.png is not an accepted file type.')
    expect(alert).toHaveTextContent('big.pdf is 5 KB; the limit is 1000 B.')
    expect(screen.queryByRole('list', { name: 'Selected files' })).not.toBeInTheDocument()
  })

  it('accepts files dropped on the zone', () => {
    const onFilesChange = vi.fn()
    const { container } = render(<FileDrop onFilesChange={onFilesChange} />)
    const zone = container.querySelector('input[type="file"]')!.parentElement as HTMLElement
    fireEvent.dragOver(zone)
    expect(zone).toHaveAttribute('data-over', 'true')
    fireEvent.drop(zone, { dataTransfer: { files: [file('c.pdf', 'application/pdf')] } })
    expect(onFilesChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'c.pdf' })])
  })

  it('keeps only one file when not multiple', async () => {
    render(<FileDrop />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file('only.pdf', 'application/pdf'))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})
