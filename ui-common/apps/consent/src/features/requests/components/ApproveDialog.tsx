import type { ApiError } from '@platform/api-client'
import { Button, Checkbox, Dialog, DialogClose, Field, Input, Select, useToast } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { SENSITIVITIES, type AccessRequest, type Sensitivity } from '../../../shared/api/types'
import { SensitivityBadge, SENSITIVITY_HELP } from '../../../shared/components/SensitivityBadge'
import { describeError, fieldErrors } from '../../../shared/lib/errors'
import {
  DURATION_UNITS,
  formatDuration,
  splitDuration,
  type DurationUnit,
} from '../../../shared/lib/format'
import { scopePath } from '../../../shared/lib/scopes'
import { useAttributes } from '../../vault/hooks/useVault'
import { computeVisibility, describeTerms, validateApproval } from '../api/approval'
import { useApproveRequest } from '../hooks/useRequests'

const FORM_ID = 'approve-form'

function ApproveForm({
  request,
  error,
  onApprove,
  onClearError,
}: {
  request: AccessRequest
  error: ApiError | null
  onApprove: (body: NonNullable<ReturnType<typeof validateApproval>['body']>) => void
  onClearError: () => void
}) {
  const attributes = useAttributes()
  const initial = splitDuration(request.durationSeconds)
  const [scopes, setScopes] = useState<readonly string[]>(request.scopes)
  const [amount, setAmount] = useState(String(initial.amount))
  const [unit, setUnit] = useState<DurationUnit>(initial.unit)
  const [maxReads, setMaxReads] = useState('')
  const [ceiling, setCeiling] = useState<Sensitivity>('SENSITIVE')
  const [submitted, setSubmitted] = useState(false)

  const draft = {
    scopes,
    durationAmount: amount,
    durationUnit: unit,
    maxReads,
    maxSensitivity: ceiling,
  }
  const { errors, body } = validateApproval(request, draft, formatDuration)
  const server = fieldErrors(error)
  const shown = (key: keyof typeof errors, serverKey: string) =>
    (submitted ? errors[key] : undefined) ?? server[serverKey]

  const visibility = computeVisibility(attributes.data ?? [], scopes, ceiling)
  const toggleScope = (scope: string, checked: boolean) =>
    setScopes(request.scopes.filter((s) => (s === scope ? checked : scopes.includes(s))))

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    onClearError()
    if (body) onApprove(body)
  }

  return (
    <form id={FORM_ID} className="stack" onSubmit={onSubmit} noValidate>
      <p className="muted">
        <strong>{request.clientName}</strong> asked for access for{' '}
        <strong>{formatDuration(request.durationSeconds)}</strong>: &ldquo;{request.purpose}&rdquo;.
        You can narrow this request. You cannot widen it.
      </p>

      <fieldset className="fieldset">
        <legend>What it may read</legend>
        {request.scopes.map((scope) => (
          <Checkbox
            key={scope}
            checked={scopes.includes(scope)}
            onCheckedChange={(checked) => toggleScope(scope, checked === true)}
            label={<code className="mono">{scope}</code>}
            description={`Everything under ${scopePath(scope)}`}
          />
        ))}
        {shown('scopes', 'scopes') ? (
          <p role="alert" className="form-error">
            {shown('scopes', 'scopes')}
          </p>
        ) : null}
      </fieldset>

      <div className="form-row">
        <Field label="Access lasts for" error={shown('duration', 'durationSeconds')} required>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Unit" hideLabel>
          <Select value={unit} onChange={(e) => setUnit(e.target.value as DurationUnit)}>
            {DURATION_UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Limit on reads"
        description={
          request.maxReads === null
            ? 'Blank means no limit, as requested. Enter a number to cap how many times it can read.'
            : `Blank keeps the requested ${request.maxReads}. Enter a lower number to cap it further.`
        }
        error={shown('maxReads', 'maxReads')}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          value={maxReads}
          onChange={(e) => setMaxReads(e.target.value)}
        />
      </Field>

      <Field label="Most sensitive level it may see" description={SENSITIVITY_HELP[ceiling]}>
        <Select value={ceiling} onChange={(e) => setCeiling(e.target.value as Sensitivity)}>
          {SENSITIVITIES.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </Select>
      </Field>

      <section className="summary" aria-label="What this app will see">
        <p>
          <strong>{request.clientName}</strong> will be able to read:
        </p>
        {attributes.isPending ? (
          <p className="muted">Checking your vault…</p>
        ) : visibility.released.length > 0 ? (
          <ul className="summary-list" aria-label="Attributes it will see">
            {visibility.released.map((a) => (
              <li key={a.keyPath}>
                <code className="mono">{a.keyPath}</code> <SensitivityBadge level={a.sensitivity} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Nothing in your vault right now. It will see anything you add under{' '}
            {scopes.length > 0 ? scopes.map(scopePath).join(', ') : 'the selected scopes'} later.
          </p>
        )}
        {visibility.withheld.length > 0 ? (
          <p className="muted">
            Withheld because they are above {ceiling}:{' '}
            {visibility.withheld.map((a) => a.keyPath).join(', ')}.
          </p>
        ) : null}
        <p className="muted">{describeTerms(request, draft)}</p>
      </section>

      {error && Object.keys(server).length === 0 ? (
        <p role="alert" className="form-error">
          {describeError(error).message}
        </p>
      ) : null}
    </form>
  )
}

export interface ApproveDialogProps {
  request: AccessRequest | null
  onOpenChange: (open: boolean) => void
}

export function ApproveDialog({ request, onOpenChange }: ApproveDialogProps) {
  const { toast } = useToast()
  const approve = useApproveRequest()

  const handleOpenChange = (open: boolean) => {
    if (!open) approve.reset()
    onOpenChange(open)
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={handleOpenChange}
      title={request ? `Approve access for ${request.clientName}` : 'Approve access'}
      description="Choose exactly what to allow. Nothing is shared until you approve."
      size="lg"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form={FORM_ID} loading={approve.isPending}>
            Approve access
          </Button>
        </>
      }
    >
      {request ? (
        <ApproveForm
          request={request}
          error={approve.error}
          onClearError={approve.reset}
          onApprove={(body) =>
            approve.mutate(
              { id: request.id, body },
              {
                onSuccess: (grant) => {
                  toast({
                    title: 'Access approved',
                    description: `${grant.clientName} can now read ${grant.scopes.join(', ')}.`,
                    variant: 'success',
                  })
                  handleOpenChange(false)
                },
              },
            )
          }
        />
      ) : null}
    </Dialog>
  )
}
