import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  Field,
  Input,
  Select,
  useToast,
  VisuallyHidden,
  type DataTableColumn,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { CopyButton } from '../../../components/CopyButton'
import { ErrorState } from '../../../components/ErrorState'
import { PersonLabel } from '../../../components/People'
import { errorMessage } from '../../../lib/errors'
import { formatDateTime } from '../../../lib/format'
import { useCreateInvite, useInvites, useRevokeInvite } from '../hooks'
import type { HouseholdRole, Invite, InviteCreated } from '../types'

export const DEFAULT_TTL_HOURS = 168
const MAX_TTL_HOURS = 720

export function InvitesCard({ householdId }: { householdId: string }) {
  const { toast } = useToast()
  const invites = useInvites(householdId, true)
  const createInvite = useCreateInvite(householdId)
  const revokeInvite = useRevokeInvite(householdId)
  const [role, setRole] = useState<HouseholdRole>('MEMBER')
  const [hours, setHours] = useState(String(DEFAULT_TTL_HOURS))
  const [hoursError, setHoursError] = useState<string>()
  const [fresh, setFresh] = useState<InviteCreated | null>(null)
  const [revoking, setRevoking] = useState<Invite | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const ttlHours = Number(hours)
    if (!Number.isInteger(ttlHours) || ttlHours < 1 || ttlHours > MAX_TTL_HOURS)
      return setHoursError(`Enter a whole number of hours from 1 to ${MAX_TTL_HOURS} (30 days).`)
    setHoursError(undefined)
    createInvite.mutate(
      { role, ttlHours },
      {
        onSuccess: (created) => {
          setFresh(created)
          toast({ title: 'Invite code created', variant: 'success' })
        },
      },
    )
  }

  const columns: DataTableColumn<Invite>[] = [
    {
      id: 'role',
      header: 'Joins as',
      sortValue: (i) => i.role,
      cell: (i) => (i.role === 'OWNER' ? 'Owner' : 'Member'),
    },
    {
      id: 'by',
      header: 'Created by',
      cell: (i) => <PersonLabel uid={i.createdBy} />,
    },
    {
      id: 'expires',
      header: 'Expires',
      sortValue: (i) => i.expiresAt,
      cell: (i) => formatDateTime(i.expiresAt),
    },
    {
      id: 'actions',
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      headerLabel: 'Actions',
      align: 'end',
      cell: (i) => (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Revoke invite expiring ${formatDateTime(i.expiresAt)}`}
          onClick={() => setRevoking(i)}
        >
          Revoke
        </Button>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Invites</CardTitle>
        <CardDescription>
          Create a single-use code and send it to the person you want to add. Codes expire on their
          own, and you can revoke one before it is used.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="hub-stack">
          <form className="hub-toolbar" onSubmit={submit} noValidate>
            <Field label="Invite as">
              <Select value={role} onChange={(e) => setRole(e.target.value as HouseholdRole)}>
                <option value="MEMBER">Member</option>
                <option value="OWNER">Owner</option>
              </Select>
            </Field>
            <Field label="Valid for (hours)" error={hoursError}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_TTL_HOURS}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </Field>
            <Button type="submit" loading={createInvite.isPending}>
              Create invite code
            </Button>
          </form>
          {createInvite.error ? <p role="alert">{errorMessage(createInvite.error)}</p> : null}

          {fresh ? (
            <div className="hub-callout hub-callout-warning" role="status">
              <strong>Invite code</strong>
              <span className="hub-mono" data-testid="invite-code">
                {fresh.code}
              </span>
              <span>
                Copy it now: for safety it is shown only this once. It expires{' '}
                {formatDateTime(fresh.expiresAt)} and joins people as{' '}
                {fresh.role === 'OWNER' ? 'an owner' : 'a member'}.
              </span>
              <div className="hub-row">
                <CopyButton value={fresh.code} label="Copy code" />
                <Button variant="ghost" size="sm" onClick={() => setFresh(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ) : null}

          <div className="hub-stack-sm">
            <h3 className="hub-h2">Pending invites</h3>
            {invites.isError ? (
              <ErrorState
                error={invites.error}
                onRetry={() => void invites.refetch()}
                headingAs="h3"
              />
            ) : (
              <DataTable
                caption="Pending invites"
                columns={columns}
                data={invites.data ?? []}
                getRowId={(i) => i.id}
                loading={invites.isPending}
                emptyState={
                  <EmptyState
                    headingAs="h3"
                    title="No pending invites"
                    description="Create a code above to invite someone."
                  />
                }
              />
            )}
          </div>
        </div>
      </CardContent>
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevoking(null)
            revokeInvite.reset()
          }
        }}
        title="Revoke this invite?"
        description="The code stops working immediately. Anyone you already sent it to will need a new one."
        confirmLabel="Revoke invite"
        pending={revokeInvite.isPending}
        error={revokeInvite.error}
        onConfirm={() => {
          if (!revoking) return
          revokeInvite.mutate(
            { inviteId: revoking.id },
            {
              onSuccess: () => {
                toast({ title: 'Invite revoked', variant: 'success' })
                setRevoking(null)
              },
            },
          )
        }}
      />
    </Card>
  )
}
