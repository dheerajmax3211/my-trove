import type { ApiError } from '@platform/api-client'
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Dialog,
  DialogClose,
  EmptyState,
  Field,
  Illustration,
  Input,
  PlusIcon,
  Switch,
  Textarea,
} from '@platform/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorPanel, LoadingBlock, Screen } from '../components/common'
import shared from '../components/shared.module.css'
import { FLAG_KEY_PATTERN, PERMISSIONS, PERSONA_ORDER, PLAN_NAMES } from '../lib/catalogue'
import { errorMessage, usePlatformClient, usePlatformQuery, useNames } from '../lib/api'
import { formatRelative } from '../lib/format'
import type { Flag, FlagInput } from '../lib/types'
import styles from './Flags.module.css'

const FLAGS_KEY = ['platform', '/v1/flags'] as const

export function FlagsScreen() {
  return (
    <Screen
      title="Feature flags"
      area="Feature flags"
      permission={PERMISSIONS.flagsManage}
      description="Switch a feature on for everyone, or roll it out to a share of people, one plan or one role at a time."
    >
      <FlagsBody />
    </Screen>
  )
}

const toInput = (flag: Flag, changes: Partial<FlagInput> = {}): FlagInput => ({
  description: flag.description,
  enabled: flag.enabled,
  rolloutPercent: flag.rolloutPercent,
  allowedPlans: flag.allowedPlans,
  allowedRoles: flag.allowedRoles,
  ...changes,
})

function FlagsBody() {
  const client = usePlatformClient()
  const queryClient = useQueryClient()
  const flags = usePlatformQuery<Flag[]>('/v1/flags')
  const names = useNames((flags.data ?? []).map((f) => f.updatedBy))
  const [editing, setEditing] = useState<Flag | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Flag | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: FLAGS_KEY })

  const toggle = useMutation<Flag, ApiError, Flag>({
    mutationFn: (flag) =>
      client.put<Flag>(
        `/v1/flags/${encodeURIComponent(flag.key)}`,
        toInput(flag, { enabled: !flag.enabled }),
      ),
    onMutate: (flag) => {
      setFailure(null)
      setBusyKey(flag.key)
    },
    onSuccess: refresh,
    onError: (error, flag) => setFailure(`Could not change ${flag.key}: ${errorMessage(error)}`),
    onSettled: () => setBusyKey(null),
  })

  const remove = useMutation<void, ApiError, Flag>({
    mutationFn: (flag) => client.delete<void>(`/v1/flags/${encodeURIComponent(flag.key)}`),
    onMutate: () => setFailure(null),
    onSuccess: async () => {
      setDeleting(null)
      await refresh()
    },
    onError: (error, flag) => {
      setDeleting(null)
      setFailure(`Could not delete ${flag.key}: ${errorMessage(error)}`)
    },
  })

  if (flags.isPending) return <LoadingBlock label="Loading flags" rows={3} />
  if (flags.isError) {
    return (
      <ErrorPanel
        error={flags.error}
        subject="feature flags"
        onRetry={() => void flags.refetch()}
      />
    )
  }

  return (
    <div className={shared.stackTight}>
      <div className={styles.bar}>
        <p className={shared.muted} role="status">
          {flags.data.length === 0
            ? 'No flags yet.'
            : `${flags.data.length} ${flags.data.length === 1 ? 'flag' : 'flags'}, ${flags.data.filter((f) => f.enabled).length} on.`}
        </p>
        <Button leftIcon={<PlusIcon size={16} />} onClick={() => setEditing('new')}>
          New flag
        </Button>
      </div>

      {failure ? (
        <Callout variant="danger" title="That did not go through">
          {failure}
        </Callout>
      ) : null}

      {flags.data.length === 0 ? (
        <EmptyState
          illustration={<Illustration name="key" />}
          title="No feature flags yet"
          description="A flag lets you ship a feature switched off, then turn it on for a share of people without a release."
          action={<Button onClick={() => setEditing('new')}>Create the first flag</Button>}
        />
      ) : (
        <ul className={styles.list} aria-label="Feature flags">
          {flags.data.map((flag) => (
            <li key={flag.key} className={styles.row} data-enabled={flag.enabled}>
              <div className={styles.main}>
                <div className={styles.titleLine}>
                  <code className={styles.key}>{flag.key}</code>
                  <Badge variant={flag.enabled ? 'success' : 'neutral'} dot>
                    {flag.enabled ? 'On' : 'Off'}
                  </Badge>
                </div>
                {flag.description ? <p className={shared.muted}>{flag.description}</p> : null}
                <dl className={styles.facts}>
                  <div>
                    <dt>Rollout</dt>
                    <dd>
                      <span className={styles.meter} aria-hidden="true">
                        <span style={{ width: `${flag.rolloutPercent}%` }} />
                      </span>
                      {flag.rolloutPercent}% of eligible people
                    </dd>
                  </div>
                  <div>
                    <dt>Plans</dt>
                    <dd>{flag.allowedPlans.length ? flag.allowedPlans.join(', ') : 'Any plan'}</dd>
                  </div>
                  <div>
                    <dt>Roles</dt>
                    <dd>{flag.allowedRoles.length ? flag.allowedRoles.join(', ') : 'Any role'}</dd>
                  </div>
                  {flag.updatedAt ? (
                    <div>
                      <dt>Updated</dt>
                      <dd>
                        {formatRelative(flag.updatedAt)}
                        {flag.updatedBy ? ` by ${names.nameOf(flag.updatedBy)}` : ''}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
              <div className={styles.controls}>
                <Switch
                  aria-label={`Enable ${flag.key}`}
                  checked={flag.enabled}
                  disabled={busyKey === flag.key}
                  onCheckedChange={() => toggle.mutate(flag)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing(flag)}
                  aria-label={`Edit ${flag.key}`}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleting(flag)}
                  aria-label={`Delete ${flag.key}`}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <FlagDialog
          flag={editing === 'new' ? null : editing}
          existingKeys={flags.data.map((f) => f.key)}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      ) : null}

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Delete ${deleting?.key ?? 'flag'}?`}
        description="The flag and its rollout settings are removed for good. Whatever reads it will stop seeing it."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Keep flag</Button>
            </DialogClose>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting)}
            >
              Delete flag
            </Button>
          </>
        }
      />
    </div>
  )
}

interface FormState {
  key: string
  description: string
  enabled: boolean
  rollout: string
  plans: string[]
  roles: string[]
}

export function validateFlagForm(
  form: FormState,
  creating: boolean,
  existingKeys: readonly string[],
): { key?: string; rollout?: string; description?: string } {
  const errors: { key?: string; rollout?: string; description?: string } = {}
  if (creating) {
    if (!form.key) errors.key = 'Enter a key.'
    else if (!FLAG_KEY_PATTERN.test(form.key))
      errors.key =
        'Use 1 to 64 characters: lower case letters, digits, dot, dash or underscore, starting with a letter or digit.'
    else if (existingKeys.includes(form.key)) errors.key = 'A flag with this key already exists.'
  }
  const rollout = Number(form.rollout)
  if (form.rollout.trim() === '' || !Number.isInteger(rollout) || rollout < 0 || rollout > 100)
    errors.rollout = 'Enter a whole number from 0 to 100.'
  if (form.description.length > 500) errors.description = 'Keep it to 500 characters or fewer.'
  return errors
}

function FlagDialog({
  flag,
  existingKeys,
  onClose,
  onSaved,
}: {
  flag: Flag | null
  existingKeys: readonly string[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const client = usePlatformClient()
  const creating = flag === null
  const [form, setForm] = useState<FormState>({
    key: flag?.key ?? '',
    description: flag?.description ?? '',
    enabled: flag?.enabled ?? false,
    rollout: String(flag?.rolloutPercent ?? 100),
    plans: flag?.allowedPlans ?? [],
    roles: flag?.allowedRoles ?? [],
  })
  const [submitted, setSubmitted] = useState(false)
  const errors = submitted ? validateFlagForm(form, creating, existingKeys) : {}

  const save = useMutation<Flag, ApiError, FlagInput>({
    mutationFn: (input) =>
      creating
        ? client.post<Flag>('/v1/flags', input)
        : client.put<Flag>(`/v1/flags/${encodeURIComponent(flag.key)}`, input),
    onSuccess: onSaved,
  })

  const set = <K extends keyof FormState>(name: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [name]: value }))
  const toggleIn = (name: 'plans' | 'roles', value: string, on: boolean) =>
    setForm((f) => ({
      ...f,
      [name]: on ? [...f[name], value] : f[name].filter((v) => v !== value),
    }))

  const submit = () => {
    setSubmitted(true)
    if (Object.keys(validateFlagForm(form, creating, existingKeys)).length > 0) return
    save.mutate({
      ...(creating ? { key: form.key } : {}),
      description: form.description,
      enabled: form.enabled,
      rolloutPercent: Number(form.rollout),
      allowedPlans: form.plans,
      allowedRoles: form.roles,
    })
  }

  const sliderValue = Math.min(100, Math.max(0, Number(form.rollout) || 0))

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      size="lg"
      title={creating ? 'New feature flag' : `Edit ${flag.key}`}
      description={
        creating
          ? 'Flags start switched off unless you turn them on here.'
          : 'Changes apply to the next evaluation, not to pages already open.'
      }
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button loading={save.isPending} onClick={submit}>
            {creating ? 'Create flag' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {save.isError ? (
          <Callout
            variant="danger"
            title={creating ? 'Could not create the flag' : 'Could not save the flag'}
          >
            {errorMessage(save.error)}
          </Callout>
        ) : null}

        <Field
          label="Key"
          required
          description="Lower case letters, digits, dot, dash, underscore. Cannot be changed later."
          error={errors.key}
        >
          <Input
            value={form.key}
            disabled={!creating}
            placeholder="new-dashboard"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => set('key', event.target.value)}
          />
        </Field>

        <Field
          label="Description"
          description="What it switches, for the next person."
          error={errors.description}
        >
          <Textarea
            rows={2}
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </Field>

        <Switch
          label="Enabled"
          description="A disabled flag is off for everyone, whatever the rollout says."
          checked={form.enabled}
          onCheckedChange={(on) => set('enabled', on)}
        />

        <div className={styles.rollout}>
          <Field
            label="Rollout percentage"
            error={errors.rollout}
            description="Share of eligible people who see it. The same person always gets the same answer."
          >
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={form.rollout}
              onChange={(event) => set('rollout', event.target.value)}
            />
          </Field>
          <input
            type="range"
            className={styles.slider}
            min={0}
            max={100}
            step={1}
            value={sliderValue}
            aria-label="Rollout percentage slider"
            onChange={(event) => set('rollout', event.target.value)}
          />
        </div>

        <fieldset className={styles.fieldset}>
          <legend>Only these plans</legend>
          <p className={shared.subtle}>Leave all unchecked to allow every plan.</p>
          <div className={styles.checks}>
            {PLAN_NAMES.map((plan) => (
              <Checkbox
                key={plan}
                label={plan}
                checked={form.plans.includes(plan)}
                onCheckedChange={(on) => toggleIn('plans', plan, on === true)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Only these roles</legend>
          <p className={shared.subtle}>Leave all unchecked to allow every role.</p>
          <div className={styles.checks}>
            {PERSONA_ORDER.map((role) => (
              <Checkbox
                key={role}
                label={role}
                checked={form.roles.includes(role)}
                onCheckedChange={(on) => toggleIn('roles', role, on === true)}
              />
            ))}
          </div>
        </fieldset>
      </form>
    </Dialog>
  )
}
