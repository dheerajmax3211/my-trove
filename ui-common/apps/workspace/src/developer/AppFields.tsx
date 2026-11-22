import { Field, Input, Textarea } from '@platform/ui'
import { MAX_REDIRECT_URIS, parseRedirectUris } from './urls'
import type { AppInput } from './hooks'

export interface AppFieldValues {
  name: string
  description: string
  redirectText: string
}

export interface AppFieldErrors {
  name?: string
  redirectUris?: string
}

/** The fields an app is made of. Errors are plain sentences, next to the field they are about. */
export function appFieldsValid(values: AppFieldValues): {
  errors: AppFieldErrors
  input?: AppInput
} {
  const errors: AppFieldErrors = {}
  const name = values.name.trim()
  if (name === '') errors.name = 'Enter a name for the app.'
  else if (name.length > 80) errors.name = 'Keep the name to 80 characters or fewer.'
  const parsed = parseRedirectUris(values.redirectText)
  if (parsed.error) errors.redirectUris = parsed.error
  if (errors.name || errors.redirectUris) return { errors }
  return {
    errors,
    input: {
      name,
      description: values.description.trim(),
      redirectUris: parsed.uris,
    },
  }
}

export function AppFields({
  values,
  errors,
  onChange,
  idPrefix,
  disabled = false,
}: {
  values: AppFieldValues
  errors: AppFieldErrors
  onChange: (next: AppFieldValues) => void
  idPrefix: string
  disabled?: boolean
}) {
  return (
    <>
      <Field
        label="Name"
        required
        error={errors.name}
        description="What people will see when your app asks for access."
        controlId={`${idPrefix}-name`}
      >
        <Input
          value={values.name}
          maxLength={80}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, name: event.target.value })}
        />
      </Field>
      <Field
        label="Description"
        description="Optional. One or two sentences about what the app does."
        controlId={`${idPrefix}-description`}
      >
        <Textarea
          value={values.description}
          maxLength={500}
          rows={2}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, description: event.target.value })}
        />
      </Field>
      <Field
        label="Redirect addresses"
        description={`One per line, up to ${MAX_REDIRECT_URIS}. Use https://. Plain http:// works only for localhost and 127.0.0.1, for local development.`}
        error={errors.redirectUris}
        controlId={`${idPrefix}-redirects`}
      >
        <Textarea
          value={values.redirectText}
          rows={3}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => onChange({ ...values, redirectText: event.target.value })}
        />
      </Field>
    </>
  )
}
