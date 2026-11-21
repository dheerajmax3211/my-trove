import { Button, Field, Input } from '@platform/ui'
import type { ReactNode } from 'react'
import { ErrorNotice } from '../../../components/ErrorNotice'

export function DescriptionField({
  value,
  onChange,
  error,
  label = 'What is it for?',
}: {
  value: string
  onChange: (v: string) => void
  error?: string | undefined
  label?: string
}) {
  return (
    <Field label={label} required error={error}>
      <Input value={value} maxLength={500} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

export function validateDescription(value: string): string | undefined {
  if (value.trim() === '') return 'Add a short description so the record makes sense later.'
  if (value.length > 500) return 'Keep the description under 500 characters.'
  return undefined
}

/** Result card shown after a successful submit, with the one obvious next step. */
export function SuccessPanel({
  title,
  children,
  onAgain,
  againLabel,
}: {
  title: string
  children?: ReactNode
  onAgain: () => void
  againLabel: string
}) {
  return (
    <div role="status" className="ft-notice ft-notice-success">
      <strong>{title}</strong>
      {children}
      <div>
        <Button variant="secondary" size="sm" onClick={onAgain}>
          {againLabel}
        </Button>
      </div>
    </div>
  )
}

export function SubmitRow({
  label,
  loading,
  error,
  currency,
}: {
  label: string
  loading: boolean
  error: unknown
  currency: string
}) {
  return (
    <>
      {error ? <ErrorNotice error={error} currency={currency} /> : null}
      <div>
        <Button type="submit" loading={loading}>
          {label}
        </Button>
      </div>
    </>
  )
}
