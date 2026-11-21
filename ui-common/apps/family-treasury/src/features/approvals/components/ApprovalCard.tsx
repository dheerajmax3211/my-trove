import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  ClockIcon,
  Field,
  KeyValueList,
  Textarea,
  useToast,
  type BadgeVariant,
} from '@platform/ui'
import { useState } from 'react'
import { useIdempotentMutation } from '../../../api/hooks'
import type { ApprovalStatus, ApprovalView } from '../../../api/types'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { MoneyText } from '../../../components/MoneyText'
import { useNow } from '../../../clock'
import { formatDateTime, formatRelative } from '../../../lib/dates'
import { canApprove } from '../../../lib/permissions'
import { useHousehold } from '../../household/hooks/useHousehold'

const STATUS: Record<ApprovalStatus, { label: string; variant: BadgeVariant }> = {
  PENDING_APPROVAL: { label: 'Waiting for approval', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
  EXPIRED: { label: 'Expired', variant: 'neutral' },
}

function RejectDialog({
  approval,
  onClose,
  withdraw,
}: {
  approval: ApprovalView
  onClose: () => void
  withdraw: boolean
}) {
  const h = useHousehold()
  const { toast } = useToast()
  const [note, setNote] = useState('')
  const { mutation, submit } = useIdempotentMutation<ApprovalView, { note: string | null }>({
    run: (api, vars, key) => api.reject(h.household.id, approval.id, vars.note, key),
    householdId: h.household.id,
    onSuccess: () => {
      toast({ title: withdraw ? 'Request withdrawn' : 'Request rejected', variant: 'success' })
      onClose()
    },
  })
  return (
    <ConfirmDialog
      title={withdraw ? 'Withdraw this request?' : 'Reject this request?'}
      description={`Nothing will be recorded. "${approval.description}" will be closed and cannot be reopened.`}
      confirmLabel={withdraw ? 'Withdraw request' : 'Reject request'}
      variant="danger"
      loading={mutation.isPending}
      onCancel={onClose}
      onConfirm={() => submit({ note: note.trim() === '' ? null : note.trim() })}
    >
      <div className="ft-form">
        <Field label="Note (optional)" description="Shown to the requester. Up to 500 characters.">
          <Textarea
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {mutation.error ? <ErrorNotice error={mutation.error} currency={h.currency} /> : null}
      </div>
    </ConfirmDialog>
  )
}

/**
 * One request. Approve/Reject each own an Idempotency-Key for the life of this card, so a double click decides
 * once. People who cannot decide are told why instead of seeing a dead button.
 */
export function ApprovalCard({ approval }: { approval: ApprovalView }) {
  const h = useHousehold()
  const { toast } = useToast()
  const now = useNow()
  const [rejecting, setRejecting] = useState(false)
  const pending = approval.status === 'PENDING_APPROVAL'
  const mine = approval.requestedByUid === h.me.uid
  const mayDecide = canApprove(h.role)

  const approve = useIdempotentMutation<ApprovalView, void>({
    run: (api, _vars, key) => api.approve(h.household.id, approval.id, key),
    householdId: h.household.id,
    onSuccess: () =>
      toast({
        title: 'Approved and recorded',
        description: approval.description,
        variant: 'success',
      }),
  })

  const reasonId = `approval-reason-${approval.id}`
  const status = STATUS[approval.status]
  const requester = mine ? 'you' : h.memberName(approval.requestedByUid)
  return (
    <Card className="ft-approval-card" data-status={approval.status}>
      <CardContent>
        <div className="ft-approval">
          <div className="ft-approval-amount">
            <p className="ft-approval-figure">
              <MoneyText minor={approval.amountMinor} currency={approval.currency} />
            </p>
            <Badge variant={status.variant} dot>
              {status.label}
            </Badge>
          </div>
          <div className="ft-approval-main">
            <h3 className="ft-h3">{approval.description}</h3>
            <p className="ft-who">
              <Avatar name={h.memberName(approval.requestedByUid)} size="xs" decorative />
              <span>
                Requested by {requester} on {formatDateTime(approval.createdAt)}
              </span>
            </p>
            <KeyValueList
              dense
              className="ft-approval-facts"
              items={[
                { id: 'from', label: 'Paid from', value: h.accountName(approval.fromAccountId) },
                { id: 'for', label: 'Category', value: h.accountName(approval.toAccountId) },
              ]}
            />
            {pending ? (
              <p className="ft-expiry">
                <ClockIcon size={16} />
                <span>
                  Expires {formatRelative(approval.expiresAt, now)} (
                  {formatDateTime(approval.expiresAt)})
                </span>
              </p>
            ) : null}
            {approval.status === 'EXPIRED' ? (
              <p className="ft-muted">Expired on {formatDateTime(approval.expiresAt)}.</p>
            ) : null}
            {approval.decidedByUid && approval.decidedAt ? (
              <p className="ft-muted">
                {approval.status === 'APPROVED' ? 'Approved' : 'Closed'} by{' '}
                {approval.decidedByUid === h.me.uid ? 'you' : h.memberName(approval.decidedByUid)}{' '}
                on {formatDateTime(approval.decidedAt)}.
                {approval.decisionNote ? ` Note: ${approval.decisionNote}` : ''}
              </p>
            ) : null}
          </div>
        </div>

        {pending ? (
          <div className="ft-actions">
            {mayDecide ? (
              <>
                <Button
                  aria-label={`Approve ${approval.description}`}
                  disabled={mine || approve.mutation.isSuccess}
                  aria-describedby={mine ? reasonId : undefined}
                  loading={approve.mutation.isPending}
                  onClick={() => approve.submit()}
                >
                  Approve
                </Button>
                {mine ? null : (
                  <Button
                    variant="secondary"
                    aria-label={`Reject ${approval.description}`}
                    onClick={() => setRejecting(true)}
                  >
                    Reject
                  </Button>
                )}
              </>
            ) : null}
            {mine ? (
              <Button
                variant="ghost"
                aria-label={`Withdraw ${approval.description}`}
                onClick={() => setRejecting(true)}
              >
                Withdraw request
              </Button>
            ) : null}
            {mine && mayDecide ? (
              <p id={reasonId} className="ft-muted">
                You cannot approve your own request. Another owner or approver has to.
              </p>
            ) : null}
            {!mayDecide ? (
              <p className="ft-muted">
                Only an owner or approver can decide. You will see the outcome here.
              </p>
            ) : null}
          </div>
        ) : null}
        {approve.mutation.error ? (
          <ErrorNotice error={approve.mutation.error} currency={h.currency} />
        ) : null}
        {rejecting ? (
          <RejectDialog approval={approval} withdraw={mine} onClose={() => setRejecting(false)} />
        ) : null}
      </CardContent>
    </Card>
  )
}
