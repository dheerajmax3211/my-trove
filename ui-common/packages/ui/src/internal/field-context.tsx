import { createContext, useContext } from 'react'

export interface FieldContextValue {
  id: string
  descriptionId: string | undefined
  errorId: string | undefined
  invalid: boolean
  required: boolean
  disabled: boolean
  /** The label floats inside the control (controls then carry a single-space placeholder). */
  floating: boolean
  /** The field validated successfully (shows a check). */
  valid: boolean
}

export const FieldContext = createContext<FieldContextValue | null>(null)

export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext)
}

export interface ControlOwnProps {
  id?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling' | undefined
  'aria-required'?: boolean | 'true' | 'false' | undefined
  disabled?: boolean | undefined
  invalid?: boolean | undefined
  required?: boolean | undefined
}

/**
 * Merge a form control's own props with the surrounding <Field>: id (so the label points at it),
 * aria-describedby (description + error), aria-invalid, aria-required and disabled.
 */
export function useFieldControl(own: ControlOwnProps) {
  const field = useFieldContext()
  const describedBy =
    [own['aria-describedby'], field?.descriptionId, field?.invalid ? field.errorId : undefined]
      .filter(Boolean)
      .join(' ') || undefined
  const invalid =
    own.invalid ??
    (own['aria-invalid'] ? own['aria-invalid'] !== 'false' : undefined) ??
    field?.invalid ??
    false
  const required = own.required ?? field?.required ?? false
  return {
    id: own.id ?? field?.id,
    'aria-describedby': describedBy,
    'aria-invalid': invalid ? true : undefined,
    'aria-required': required ? true : undefined,
    disabled: own.disabled ?? field?.disabled ?? false,
    invalid,
    required,
    floating: field?.floating ?? false,
    valid: field?.valid ?? false,
  }
}
