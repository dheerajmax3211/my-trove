import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  Field,
  Select,
  useToast,
  type DataTableColumn,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { useGuardedMutation, useTreasuryQuery } from '../../../api/hooks'
import { treasuryKeys } from '../../../api/keys'
import type { CreateInviteRequest, InviteCreated, InviteView, Role } from '../../../api/types'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { ROLE_LABEL } from '../../../components/RoleBadge'
import { formatDateTime } from '../../../lib/dates'
import { useHousehold } from '../../household/hooks/useHousehold'

/** Roles an invite can grant. A KID needs an owner-linked pot, so kids are added by an owner, not by a code. */
const INVITE_ROLES: readonly Role[] = ['MEMBER', 'APPROVER', 'OWNER']

/**
 * Owners invite people by code: create a single-use code, send it, and the other person joins from their own account.
 * Nobody has to look up or type anyone's member ID.
 */
export function InvitesCard() {
  const h = useHousehold()
  const householdId = h.household.id
  const { toast } = useToast()
  const invites = useTreasuryQuery(treasuryKeys.invites(householdId), (api) =>
    api.listInvites(householdId),
  )
  const [role, setRole] = useState<Role>('MEMBER')
  const [fresh, setFresh] = useState<InviteCreated | null>(null)

  const create = useGuardedMutation<InviteCreated, CreateInviteRequest>({
    run: (api, body) => api.createInvite(householdId, body),
    householdId,
    onSuccess: (created) => {
      setFresh(created)
      toast({ title: 'Invite code created', variant: 'success' })
    },
  })
  const cancel = useGuardedMutation<void, string>({
    run: (api, inviteId) => api.revokeInvite(householdId, inviteId),
    householdId,
    onSuccess: () => toast({ title: 'Invite cancelled', variant: 'success' }),
  })

  const nameOf = (uid: string) =>
    h.household.members.find((m) => m.uid === uid)?.displayName ?? 'an owner'

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast({ title: 'Code copied', variant: 'success' })
    } catch {
      toast({
        title: 'Could not copy',
        description: 'Select the code and copy it by hand.',
        variant: 'danger',
      })
    }
  }

  const columns: DataTableColumn<InviteView>[] = [
    { id: 'role', header: 'Joins as', cell: (i) => ROLE_LABEL[i.role] },
    { id: 'by', header: 'Created by', cell: (i) => nameOf(i.createdByUid) },
    {
      id: 'expires',
      header: 'Expires',
      sortValue: (i) => i.expiresAt,
      cell: (i) => formatDateTime(i.expiresAt),
    },
    {
      id: 'actions',
      header: 'Cancel',
      align: 'end',
      cell: (i) => (
        <Button
          size="sm"
          variant="ghost"
          disabled={cancel.mutation.isPending}
          aria-label={`Cancel invite expiring ${formatDateTime(i.expiresAt)}`}
          onClick={() => cancel.submit(i.id)}
        >
          Cancel
        </Button>
      ),
    },
  ]

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFresh(null)
    create.submit({ role })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Invite someone</CardTitle>
        <CardDescription>
          Create a code and send it to the person. It works once, joins them with the role you
          choose, and gives them a pot of their own.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="ft-stack">
          <form className="ft-form" onSubmit={onSubmit} noValidate>
            <Field label="Joins as" required>
              <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {INVITE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={create.mutation.isPending}>
              Create invite code
            </Button>
          </form>
          {create.mutation.error ? <ErrorNotice error={create.mutation.error} /> : null}

          {fresh ? (
            <div className="ft-notice" role="status">
              <strong>Invite code</strong>
              <code className="ft-mono" data-testid="invite-code">
                {fresh.code}
              </code>
              <p>
                Copy it now: it is shown only once. It expires {formatDateTime(fresh.expiresAt)} and
                joins people as {ROLE_LABEL[fresh.role]}.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button size="sm" variant="secondary" onClick={() => void copy(fresh.code)}>
                  Copy code
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFresh(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ) : null}
          {cancel.mutation.error ? <ErrorNotice error={cancel.mutation.error} /> : null}

          <DataTable
            caption="Pending invites"
            columns={columns}
            data={invites.data ?? []}
            getRowId={(i) => i.id}
            loading={invites.isPending}
            emptyState={<p className="ft-muted">No open invite codes.</p>}
          />
        </div>
      </CardContent>
    </Card>
  )
}
