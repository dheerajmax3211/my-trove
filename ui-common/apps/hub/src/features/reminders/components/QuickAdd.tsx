import { Button, Field, Input, useToast } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { ScopeSelect, SCOPE_PERSONAL } from '../../../components/ScopeSelect'
import { useCoreEnv } from '../../../core/env'
import { errorMessage } from '../../../lib/errors'
import { toLocalInputValue } from '../../../lib/format'
import type { Household } from '../../households/types'
import { useCreateReminder } from '../hooks'
import { validateReminder } from '../validate'
import styles from './QuickAdd.module.css'

const HOUR_MS = 3_600_000

/** One line to add a reminder: what, when, for whom. Repeats and edits live in the full dialog. */
export function QuickAdd({
  households,
  defaultScope,
}: {
  households: readonly Household[]
  defaultScope?: string | undefined
}) {
  const { toast } = useToast()
  const { now } = useCoreEnv()
  const create = useCreateReminder()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(() => toLocalInputValue(new Date(now() + 24 * HOUR_MS).toISOString()))
  const [scope, setScope] = useState(defaultScope ?? SCOPE_PERSONAL)
  const [errors, setErrors] = useState<{ title?: string; due?: string }>({})

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const { errors: found, input } = validateReminder({ title, due, repeat: 'NONE', interval: '1' })
    setErrors({
      ...(found.title ? { title: found.title } : {}),
      ...(found.due ? { due: found.due } : {}),
    })
    if (!input) return
    create.mutate(
      { ...input, ...(scope === SCOPE_PERSONAL ? {} : { householdId: scope }) },
      {
        onSuccess: () => {
          toast({ title: 'Reminder created', description: input.title, variant: 'success' })
          setTitle('')
        },
      },
    )
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-label="Add a reminder">
      <Field label="Remind me to" error={errors.title} className={styles.title}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Renew the passport"
          autoComplete="off"
        />
      </Field>
      <Field label="When" error={errors.due}>
        <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <ScopeSelect label="For" value={scope} onChange={setScope} households={households} />
      <Button type="submit" loading={create.isPending} className={styles.submit}>
        Add reminder
      </Button>
      {create.error ? (
        <p role="alert" className={styles.error}>
          {errorMessage(create.error)}
        </p>
      ) : null}
    </form>
  )
}
