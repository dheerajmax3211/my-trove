import { Button, Field, Input, Select, Textarea } from '@platform/ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorMessage, fieldErrorsFrom, type FieldErrors } from '../../../lib/errors'
import { FORM_FIELDS, validateForm, toInput, type ApplianceFormValues } from '../formState'
import { APPLIANCE_TYPES, TYPE_LABELS, type ApplianceInput } from '../types'

export interface ApplianceFormProps {
  initial: ApplianceFormValues
  submitLabel: string
  busy: boolean
  /** The failure from the last submit, if any (server messages are shown against their fields). */
  error: unknown
  onSubmit: (input: ApplianceInput) => void
  onCancel: () => void
}

export function ApplianceForm({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: ApplianceFormProps) {
  const [values, setValues] = useState(initial)
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  const formRef = useRef<HTMLFormElement>(null)

  const serverErrors = error ? fieldErrorsFrom(error, FORM_FIELDS) : {}
  const errors: FieldErrors = { ...serverErrors, ...clientErrors }
  const formMessage = error
    ? (serverErrors[''] ?? (Object.keys(serverErrors).length === 0 ? errorMessage(error) : ''))
    : ''

  // After a failed submit, move focus to the first field with a problem.
  const [attempt, setAttempt] = useState(0)
  const hasErrors = Object.keys(errors).length > 0
  useEffect(() => {
    if (attempt === 0 || !hasErrors) return
    const first = FORM_FIELDS.find((f) => errors[f])
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
    // Only on a new submit attempt or a new server error, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, error])

  const set =
    <K extends keyof ApplianceFormValues>(field: K) =>
    (value: ApplianceFormValues[K]) => {
      setValues((current) => ({ ...current, [field]: value }))
      setClientErrors((current) => ({ ...current, [field]: '' }))
    }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateForm(values)
    setClientErrors(found)
    setAttempt((n) => n + 1)
    if (Object.keys(found).length === 0) onSubmit(toInput(values))
  }

  return (
    <form ref={formRef} className="stack-4 form-narrow" onSubmit={submit} noValidate>
      {formMessage ? (
        <p role="alert" className="form-error">
          {formMessage}
        </p>
      ) : null}
      <Field label="Name" required error={errors.name}>
        <Input
          name="name"
          value={values.name}
          onChange={(e) => set('name')(e.target.value)}
          placeholder="Kitchen fridge"
          autoComplete="off"
        />
      </Field>
      <div className="form-row">
        <Field label="Type" required error={errors.type}>
          <Select
            name="type"
            placeholder="Choose a type"
            value={values.type}
            onChange={(e) => set('type')(e.target.value as ApplianceFormValues['type'])}
          >
            {APPLIANCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location" error={errors.location}>
          <Input
            name="location"
            value={values.location}
            onChange={(e) => set('location')(e.target.value)}
            placeholder="Kitchen"
          />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Purchase date" error={errors.purchaseDate}>
          <Input
            name="purchaseDate"
            type="date"
            value={values.purchaseDate}
            onChange={(e) => set('purchaseDate')(e.target.value)}
          />
        </Field>
        <Field
          label="Warranty ends"
          description="Used to flag anomalies while a claim is still possible."
          error={errors.warrantyEndDate}
        >
          <Input
            name="warrantyEndDate"
            type="date"
            value={values.warrantyEndDate}
            onChange={(e) => set('warrantyEndDate')(e.target.value)}
          />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Last serviced" error={errors.lastServiceDate}>
          <Input
            name="lastServiceDate"
            type="date"
            value={values.lastServiceDate}
            onChange={(e) => set('lastServiceDate')(e.target.value)}
          />
        </Field>
        <Field label="Next service due" error={errors.nextServiceDate}>
          <Input
            name="nextServiceDate"
            type="date"
            value={values.nextServiceDate}
            onChange={(e) => set('nextServiceDate')(e.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Notes"
        description="Model, serial number, installer, anything useful."
        error={errors.notes}
      >
        <Textarea
          name="notes"
          value={values.notes}
          onChange={(e) => set('notes')(e.target.value)}
        />
      </Field>
      <div className="button-row">
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
