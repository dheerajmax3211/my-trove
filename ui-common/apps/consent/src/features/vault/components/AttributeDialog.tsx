import type { ApiError } from '@platform/api-client'
import { Button, Dialog, DialogClose, Field, Input, Select, Textarea, useToast } from '@platform/ui'
import { useRef, useState, type FormEvent } from 'react'
import { SENSITIVITIES, type Attribute, type Sensitivity } from '../../../shared/api/types'
import { SENSITIVITY_HELP } from '../../../shared/components/SensitivityBadge'
import { describeError, errorCode, fieldErrors } from '../../../shared/lib/errors'
import { parseJsonValue, stringifyJson } from '../../../shared/lib/json'
import { MAX_PATH_LENGTH, isValidKeyPath } from '../../../shared/lib/scopes'
import { useCreateAttribute, useReplaceAttribute } from '../hooks/useVault'

const FORM_ID = 'attribute-form'

function keyPathProblem(keyPath: string): string | undefined {
  if (!keyPath) return 'Enter a key path, for example profile.sizes.shoe.'
  if (keyPath.length > MAX_PATH_LENGTH) return `Use at most ${MAX_PATH_LENGTH} characters.`
  if (!isValidKeyPath(keyPath)) {
    return 'Use lowercase letters, digits and underscores, with dots between parts (profile.sizes.shoe).'
  }
  return undefined
}

interface FormValues {
  keyPath: string
  value: unknown
  sensitivity: Sensitivity
}

function AttributeForm({
  attribute,
  error,
  onSave,
  onClearError,
}: {
  attribute: Attribute | null
  error: ApiError | null
  onSave: (values: FormValues) => void
  onClearError: () => void
}) {
  const editing = attribute !== null
  const [keyPath, setKeyPath] = useState(attribute?.keyPath ?? '')
  const [valueText, setValueText] = useState(attribute ? stringifyJson(attribute.value) : '')
  const [sensitivity, setSensitivity] = useState<Sensitivity>(attribute?.sensitivity ?? 'PERSONAL')
  const [submitted, setSubmitted] = useState(false)
  const keyRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef<HTMLTextAreaElement>(null)

  const parsed = parseJsonValue(valueText)
  const server = fieldErrors(error)
  const exists = errorCode(error) === 'ATTRIBUTE_EXISTS'
  const keyError =
    (submitted ? keyPathProblem(keyPath) : undefined) ??
    server.keyPath ??
    (exists ? describeError(error).message : undefined)
  const valueError = (submitted && !parsed.ok ? parsed.message : undefined) ?? server.value
  const otherError =
    error && !exists && Object.keys(server).length === 0 ? describeError(error).message : undefined

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    onClearError()
    if (!editing && keyPathProblem(keyPath)) return keyRef.current?.focus()
    if (!parsed.ok) return valueRef.current?.focus()
    onSave({ keyPath, value: parsed.value, sensitivity })
  }

  return (
    <form id={FORM_ID} className="stack" onSubmit={onSubmit} noValidate>
      <Field
        label="Key path"
        required
        description={
          editing
            ? 'The key path cannot be changed. Delete and add it again to move it.'
            : 'Dotted lowercase path. Apps are granted whole branches, such as profile.sizes.'
        }
        error={keyError}
      >
        <Input
          ref={keyRef}
          value={keyPath}
          readOnly={editing}
          className="mono"
          autoComplete="off"
          spellCheck={false}
          placeholder="profile.sizes.shoe"
          onChange={(e) => setKeyPath(e.target.value)}
        />
      </Field>
      <Field
        label="Value (JSON)"
        required
        description='Text needs quotes, like "M". Numbers, true/false, lists and objects also work.'
        error={valueError}
      >
        <Textarea
          ref={valueRef}
          rows={6}
          value={valueText}
          className="mono"
          spellCheck={false}
          onChange={(e) => setValueText(e.target.value)}
        />
      </Field>
      <div>
        <Button
          size="sm"
          variant="secondary"
          disabled={!parsed.ok}
          onClick={() => parsed.ok && setValueText(stringifyJson(parsed.value))}
        >
          Format JSON
        </Button>
      </div>
      <Field label="Sensitivity" description={SENSITIVITY_HELP[sensitivity]} required>
        <Select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as Sensitivity)}>
          {SENSITIVITIES.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </Select>
      </Field>
      {otherError ? (
        <p role="alert" className="form-error">
          {otherError}
        </p>
      ) : null}
    </form>
  )
}

export interface AttributeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The attribute being edited, or null to add a new one. */
  attribute: Attribute | null
}

/** Add or edit one attribute. The form remounts on every open, so it always starts fresh. */
export function AttributeDialog({ open, onOpenChange, attribute }: AttributeDialogProps) {
  const { toast } = useToast()
  const create = useCreateAttribute()
  const replace = useReplaceAttribute()
  const mutation = attribute ? replace : create

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      create.reset()
      replace.reset()
    }
    onOpenChange(next)
  }

  const save = ({ keyPath, value, sensitivity }: FormValues) => {
    const onSuccess = () => {
      toast({
        title: attribute ? 'Attribute saved' : 'Attribute added',
        description: keyPath,
        variant: 'success',
      })
      handleOpenChange(false)
    }
    if (attribute) replace.mutate({ keyPath, body: { value, sensitivity } }, { onSuccess })
    else create.mutate({ keyPath, value, sensitivity }, { onSuccess })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={attribute ? 'Edit attribute' : 'Add attribute'}
      description={
        attribute
          ? `Changes apply to future reads by apps that hold access to ${attribute.keyPath}.`
          : 'Store one piece of information in your vault.'
      }
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form={FORM_ID} loading={mutation.isPending}>
            Save attribute
          </Button>
        </>
      }
    >
      <AttributeForm
        attribute={attribute}
        error={mutation.error}
        onSave={save}
        onClearError={mutation.reset}
      />
    </Dialog>
  )
}
