import type { ApiError } from '@platform/api-client'
import { Button, Dialog, DialogClose, Field, Input, Textarea } from '@platform/ui'
import { useRef, useState, type FormEvent } from 'react'
import type { ClientWithSecret, RegisterClientBody } from '../../../shared/api/types'
import { describeError, fieldErrors } from '../../../shared/lib/errors'
import { parseScopeInput } from '../../../shared/lib/scopes'
import { useRegisterClient } from '../hooks/useClients'

const FORM_ID = 'register-client-form'
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function RegisterForm({
  error,
  onSave,
  onClearError,
}: {
  error: ApiError | null
  onSave: (body: RegisterClientBody) => void
  onClearError: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [scopeText, setScopeText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const scopeRef = useRef<HTMLTextAreaElement>(null)

  const scopes = parseScopeInput(scopeText)
  const problems = {
    name: !name.trim()
      ? 'Give the app a name you will recognise.'
      : name.length > 120
        ? 'Use at most 120 characters.'
        : undefined,
    email: email.trim() && !EMAIL.test(email.trim()) ? 'Enter a valid email address.' : undefined,
    scopes: scopes.ok ? undefined : scopes.message,
  }
  const server = fieldErrors(error)
  const shown = (key: keyof typeof problems, serverKey: string) =>
    (submitted ? problems[key] : undefined) ?? server[serverKey]

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    onClearError()
    if (problems.name) return nameRef.current?.focus()
    if (problems.email) return emailRef.current?.focus()
    if (!scopes.ok) return scopeRef.current?.focus()
    onSave({
      name: name.trim(),
      ...(email.trim() ? { contactEmail: email.trim() } : {}),
      allowedScopes: scopes.scopes,
    })
  }

  return (
    <form id={FORM_ID} className="stack" onSubmit={onSubmit} noValidate>
      <Field label="App name" required error={shown('name', 'name')}>
        <Input
          ref={nameRef}
          value={name}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        label="Contact email"
        description="Optional. Who to reach about this app."
        error={shown('email', 'contactEmail')}
      >
        <Input
          ref={emailRef}
          type="email"
          value={email}
          autoComplete="off"
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field
        label="Allowed scopes"
        required
        description="The most this app may ever ask for. One per line, like profile.sizes:read. We add :read if you leave it out."
        error={shown('scopes', 'allowedScopes')}
      >
        <Textarea
          ref={scopeRef}
          rows={4}
          className="mono"
          spellCheck={false}
          value={scopeText}
          onChange={(e) => setScopeText(e.target.value)}
        />
      </Field>
      {error && Object.keys(server).length === 0 ? (
        <p role="alert" className="form-error">
          {describeError(error).message}
        </p>
      ) : null}
    </form>
  )
}

export interface RegisterClientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Receives the one and only copy of the new secret. */
  onRegistered: (result: ClientWithSecret) => void
}

export function RegisterClientDialog({
  open,
  onOpenChange,
  onRegistered,
}: RegisterClientDialogProps) {
  const register = useRegisterClient()

  const handleOpenChange = (next: boolean) => {
    if (!next) register.reset()
    onOpenChange(next)
  }

  const save = (body: RegisterClientBody) =>
    register.mutate(body, {
      onSuccess: (result) => {
        onRegistered(result)
        // Drop the secret from the query library's mutation cache; the caller now holds the only copy.
        register.reset()
        onOpenChange(false)
      },
    })

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Register an app"
      description="Registering gives the app credentials. It still needs your approval for every request."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form={FORM_ID} loading={register.isPending}>
            Register app
          </Button>
        </>
      }
    >
      <RegisterForm error={register.error} onSave={save} onClearError={register.reset} />
    </Dialog>
  )
}
