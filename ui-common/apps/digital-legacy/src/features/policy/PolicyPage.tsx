import { isApiError } from '@platform/api-client'
import { useApiMutation } from '@platform/api-client'
import { useAuth } from '@platform/auth-web'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  CloseIcon,
  EmptyState,
  Field,
  IconButton,
  Input,
  PageHeader,
  PlusIcon,
  Select,
  useToast,
} from '@platform/ui'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ownerPaths } from '../../api/paths'
import {
  AUDIENCES,
  CHANNELS,
  URGENCIES,
  type ChannelType,
  type StateView,
  type SwitchPolicy,
} from '../../api/types'
import { Callout } from '../../components/Callout'
import { ErrorNotice } from '../../components/ErrorNotice'
import { PageSkeleton } from '../../components/PageSkeleton'
import { defaultPolicy } from '../../lib/policyDefaults'
import { OWNER_KEYS, useStateQuery, useTrusteesQuery } from '../queries'
import { DurationField } from './DurationField'
import {
  POLICY_LIMITS,
  policyToInput,
  validatePolicyInput,
  type PolicyInput,
  type StepInput,
} from './policyForm'
import { TimelinePreviewView } from './TimelinePreviewView'

const URGENCY_LABEL = { NOTICE: 'Notice', WARNING: 'Warning', URGENT: 'Urgent', FINAL: 'Final' }
const AUDIENCE_LABEL = { OWNER: 'Only me', TRUSTEES: 'Only trustees', ALL: 'Me and trustees' }
const CHANNEL_LABEL: Record<ChannelType, string> = {
  EMAIL: 'Email',
  SMS: 'Text message',
  PUSH: 'Push',
}

function PolicyForm({
  state,
  defaultQuorum,
  email,
}: {
  state: StateView
  defaultQuorum: number
  email: string
}) {
  const { toast } = useToast()
  const quorum = state.policy?.quorum ?? defaultQuorum
  const [input, setInput] = useState<PolicyInput>(() =>
    policyToInput(state.policy ?? { ...defaultPolicy(email), quorum }),
  )
  const [showErrors, setShowErrors] = useState(false)
  const [lastValid, setLastValid] = useState<SwitchPolicy>(
    () => state.policy ?? { ...defaultPolicy(email), quorum },
  )
  const { policy, errors } = useMemo(() => validatePolicyInput(input, quorum), [input, quorum])
  if (policy && policy !== lastValid) setLastValid(policy)
  const locked = state.state !== 'ACTIVE'
  const shown = (key: string) => (showErrors ? errors[key] : undefined)

  const save = useApiMutation<StateView, SwitchPolicy>({
    method: 'PUT',
    path: ownerPaths.policy,
    invalidate: OWNER_KEYS,
    onSuccess: () =>
      toast({
        title: 'Policy saved',
        description: state.armed
          ? 'Your check-in interval restarted from now.'
          : 'It takes effect when you arm the switch.',
        variant: 'success',
      }),
  })

  const set = <K extends keyof PolicyInput>(key: K, value: PolicyInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }))
  const setStep = (index: number, patch: Partial<StepInput>) =>
    set(
      'steps',
      input.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    )

  const submit = () => {
    setShowErrors(true)
    if (policy) save.mutate(policy)
  }

  return (
    <div className="page-stack">
      {locked ? (
        <Callout tone="warning" title="The policy is read-only right now">
          <p>The server only accepts policy changes while the switch is quiet. Check in first.</p>
        </Callout>
      ) : null}
      <TimelinePreviewView policy={lastValid} />
      <Card aria-labelledby="timing-title">
        <CardHeader>
          <CardTitle as="h2" id="timing-title">
            Timing
          </CardTitle>
          <CardDescription>All of these run from your last check-in.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid-2">
            <DurationField
              label="Check in every"
              description="How long a check-in keeps the switch quiet."
              value={input.interval}
              error={shown('interval')}
              disabled={locked}
              onChange={(v) => set('interval', v)}
            />
            <DurationField
              label="Grace period"
              description="Extra quiet time after a missed check-in, before anyone is contacted."
              value={input.grace}
              error={shown('grace')}
              disabled={locked}
              onChange={(v) => set('grace', v)}
            />
            <DurationField
              label="Reminders last"
              description="How long the reminder schedule below runs before trustees are asked to vote."
              value={input.escalation}
              error={shown('escalation')}
              disabled={locked}
              onChange={(v) => set('escalation', v)}
            />
            <DurationField
              label="Cool-off after approval"
              description="Once enough trustees approve, you still have this long to check in and cancel."
              value={input.coolOff}
              error={shown('coolOff')}
              disabled={locked}
              onChange={(v) => set('coolOff', v)}
            />
            <DurationField
              label="Longest vacation pause"
              description={`Up to ${POLICY_LIMITS.maxPause / 86400} days. Set 0 to forbid pausing.`}
              value={input.maxPause}
              error={shown('maxPause')}
              disabled={locked}
              onChange={(v) => set('maxPause', v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card aria-labelledby="steps-title">
        <CardHeader>
          <CardTitle as="h2" id="steps-title">
            Reminder schedule
          </CardTitle>
          <CardDescription>
            Once the grace period ends, these go out in order. Times count from the start of the
            reminders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack-3">
            {shown('steps') ? (
              <Callout tone="danger" role="alert">
                <p>{shown('steps')}</p>
              </Callout>
            ) : null}
            {input.steps.map((step, i) => (
              <fieldset key={i} className="step-card" disabled={locked} style={{ margin: 0 }}>
                <legend>Reminder {i + 1}</legend>
                <div className="step-fields">
                  <DurationField
                    label={`Reminder ${i + 1} sent after`}
                    value={step.offset}
                    error={shown(`step.${i}.offset`)}
                    onChange={(v) => setStep(i, { offset: v })}
                  />
                  <Field label={`Reminder ${i + 1} urgency`} error={shown(`step.${i}.urgency`)}>
                    <Select
                      value={step.urgency}
                      onChange={(e) =>
                        setStep(i, { urgency: e.target.value as StepInput['urgency'] })
                      }
                    >
                      {URGENCIES.map((u) => (
                        <option key={u} value={u}>
                          {URGENCY_LABEL[u]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={`Reminder ${i + 1} goes to`}>
                    <Select
                      value={step.audience}
                      onChange={(e) =>
                        setStep(i, { audience: e.target.value as StepInput['audience'] })
                      }
                    >
                      {AUDIENCES.map((a) => (
                        <option key={a} value={a}>
                          {AUDIENCE_LABEL[a]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="stack-2">
                  <span className="small">
                    Try these ways to reach them, in this order of preference:
                  </span>
                  <div className="row-wrap">
                    {CHANNELS.map((c) => (
                      <Checkbox
                        key={c}
                        label={`${CHANNEL_LABEL[c]} (reminder ${i + 1})`}
                        checked={step.channels.includes(c)}
                        onCheckedChange={(checked) =>
                          setStep(i, {
                            channels:
                              checked === true
                                ? [...step.channels, c]
                                : step.channels.filter((x) => x !== c),
                          })
                        }
                      />
                    ))}
                  </div>
                  {shown(`step.${i}.channels`) ? (
                    <span role="alert" className="small">
                      {shown(`step.${i}.channels`)}
                    </span>
                  ) : null}
                </div>
                <div>
                  <IconButton
                    label={`Remove reminder ${i + 1}`}
                    icon={<CloseIcon size={16} />}
                    onClick={() =>
                      set(
                        'steps',
                        input.steps.filter((_, j) => j !== i),
                      )
                    }
                  />
                </div>
              </fieldset>
            ))}
            <div>
              <Button
                variant="secondary"
                leftIcon={<PlusIcon size={16} />}
                disabled={locked || input.steps.length >= POLICY_LIMITS.maxSteps}
                onClick={() =>
                  set('steps', [
                    ...input.steps,
                    {
                      offset: { value: String(input.steps.length + 1), unit: 'days' },
                      urgency: 'FINAL',
                      audience: 'ALL',
                      channels: ['EMAIL'],
                    },
                  ])
                }
              >
                Add a reminder
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card aria-labelledby="contacts-title">
        <CardHeader>
          <CardTitle as="h2" id="contacts-title">
            How to reach you
          </CardTitle>
          <CardDescription>
            Tried in order. Add a second way in case the first fails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack-3">
            {shown('contacts') ? (
              <Callout tone="danger" role="alert">
                <p>{shown('contacts')}</p>
              </Callout>
            ) : null}
            {input.contacts.map((contact, i) => (
              <div key={i} className="step-fields">
                <Field label={`Contact ${i + 1} type`}>
                  <Select
                    value={contact.channel}
                    disabled={locked}
                    onChange={(e) =>
                      set(
                        'contacts',
                        input.contacts.map((c, j) =>
                          j === i ? { ...c, channel: e.target.value as ChannelType } : c,
                        ),
                      )
                    }
                  >
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {CHANNEL_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={`Contact ${i + 1} address`} error={shown(`contact.${i}`)}>
                  <Input
                    value={contact.address}
                    disabled={locked}
                    autoComplete="off"
                    onChange={(e) =>
                      set(
                        'contacts',
                        input.contacts.map((c, j) =>
                          j === i ? { ...c, address: e.target.value } : c,
                        ),
                      )
                    }
                  />
                </Field>
                <div style={{ alignSelf: 'end' }}>
                  <IconButton
                    label={`Remove contact ${i + 1}`}
                    icon={<CloseIcon size={16} />}
                    disabled={locked}
                    onClick={() =>
                      set(
                        'contacts',
                        input.contacts.filter((_, j) => j !== i),
                      )
                    }
                  />
                </div>
              </div>
            ))}
            <div>
              <Button
                variant="secondary"
                leftIcon={<PlusIcon size={16} />}
                disabled={locked || input.contacts.length >= POLICY_LIMITS.maxContacts}
                onClick={() =>
                  set('contacts', [...input.contacts, { channel: 'SMS', address: '' }])
                }
              >
                Add a contact
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Callout tone="info" title={`Quorum: ${quorum} trustee${quorum === 1 ? '' : 's'} must agree`}>
        <p>
          Change it on the <Link to="/trustees">Trustees</Link> page, where you can see what each
          choice means.
        </p>
      </Callout>
      {save.error ? (
        <ErrorNotice error={save.error} title="The server did not accept the policy" />
      ) : null}
      <div>
        <Button loading={save.isPending} disabled={locked} onClick={submit}>
          Save policy
        </Button>
      </div>
    </div>
  )
}

export function PolicyPage() {
  const state = useStateQuery()
  const trustees = useTrusteesQuery()
  const { user } = useAuth()

  if (state.isPending || trustees.isPending) return <PageSkeleton label="Loading your policy" />
  if (state.error || trustees.error) {
    const error = state.error ?? trustees.error
    if (isApiError(error) && error.status === 404)
      return (
        <EmptyState
          title="Create your vault first"
          description="The policy belongs to a vault."
          action={
            <Button asChild>
              <Link to="/vault">Create your vault</Link>
            </Button>
          }
        />
      )
    return (
      <ErrorNotice
        error={error}
        onRetry={() => {
          void state.refetch()
          void trustees.refetch()
        }}
      />
    )
  }
  const active = trustees.data.filter((t) => t.status !== 'REVOKED').length
  return (
    <div className="page-stack">
      <PageHeader
        title="Check-in policy"
        description="How often you check in, how long before anyone is told, and who is told when."
      />
      <PolicyForm
        state={state.data}
        defaultQuorum={Math.min(2, Math.max(1, active))}
        email={user?.email ?? ''}
      />
    </div>
  )
}
