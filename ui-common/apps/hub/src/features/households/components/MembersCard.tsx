import { useAuth } from '@platform/auth-web'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  Select,
  useToast,
  VisuallyHidden,
  type DataTableColumn,
} from '@platform/ui'
import { useState } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { MemberLabel } from '../../../components/MemberLabel'
import { errorMessage } from '../../../lib/errors'
import { formatDate } from '../../../lib/format'
import { useChangeRole, useRemoveMember } from '../hooks'
import { canChangeRole, canRemoveMember, LAST_OWNER_REASON, ownerCount } from '../rules'
import type { HouseholdDetail, HouseholdRole, Member } from '../types'

export function MembersCard({ household }: { household: HouseholdDetail }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const changeRole = useChangeRole(household.id)
  const removeMember = useRemoveMember(household.id)
  const [removing, setRemoving] = useState<Member | null>(null)
  const callerUid = user?.uid
  const onlyOwnerLeft = ownerCount(household.members) === 1

  const onRoleChange = (member: Member, role: HouseholdRole) =>
    changeRole.mutate(
      { uid: member.uid, role },
      {
        onSuccess: () =>
          toast({
            title: 'Role updated',
            description: `${member.uid === callerUid ? 'You are' : `${member.uid} is`} now ${role === 'OWNER' ? 'an owner' : 'a member'}.`,
            variant: 'success',
          }),
        onError: (error) =>
          toast({
            title: 'Could not change the role',
            description: errorMessage(error),
            variant: 'danger',
          }),
      },
    )

  const columns: DataTableColumn<Member>[] = [
    {
      id: 'member',
      header: 'Member',
      sortValue: (m) => m.uid,
      cell: (m) => <MemberLabel uid={m.uid} currentUid={callerUid} />,
    },
    {
      id: 'role',
      header: 'Role',
      sortValue: (m) => m.role,
      cell: (m) => {
        const rule = canChangeRole(household.callerRole, household.members, m)
        if (household.callerRole !== 'OWNER')
          return (
            <Badge variant={m.role === 'OWNER' ? 'accent' : 'neutral'}>
              {m.role === 'OWNER' ? 'Owner' : 'Member'}
            </Badge>
          )
        return (
          <Select
            size="sm"
            aria-label={`Role for ${m.uid}`}
            value={m.role}
            disabled={!rule.allowed || changeRole.isPending}
            title={rule.reason}
            onChange={(e) => onRoleChange(m, e.target.value as HouseholdRole)}
            style={{ width: 'auto' }}
          >
            <option value="OWNER">Owner</option>
            <option value="MEMBER">Member</option>
          </Select>
        )
      },
    },
    {
      id: 'joined',
      header: 'Joined',
      sortValue: (m) => m.joinedAt,
      cell: (m) => formatDate(m.joinedAt),
    },
    {
      id: 'actions',
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      headerLabel: 'Actions',
      align: 'end',
      cell: (m) => {
        if (household.callerRole !== 'OWNER' || m.uid === callerUid) return null
        const rule = canRemoveMember(household.callerRole, household.members, m)
        return (
          <Button
            size="sm"
            variant="ghost"
            disabled={!rule.allowed}
            title={rule.reason}
            aria-label={`Remove ${m.uid}`}
            onClick={() => setRemoving(m)}
          >
            Remove
          </Button>
        )
      },
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Members</CardTitle>
        <CardDescription>
          {household.callerRole === 'OWNER'
            ? 'Owners can invite people, change roles and remove members.'
            : 'Only owners can invite people, change roles or remove members.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="hub-stack-sm">
          <DataTable
            caption="Household members"
            columns={columns}
            data={household.members}
            getRowId={(m) => m.uid}
          />
          <p className="hub-muted">
            {onlyOwnerLeft
              ? `Only one owner right now. ${LAST_OWNER_REASON}`
              : 'A household always keeps at least one owner.'}
          </p>
        </div>
      </CardContent>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null)
            removeMember.reset()
          }
        }}
        title={`Remove ${removing?.uid ?? 'member'}?`}
        description="They lose access to this household's reminders, files and activity. They can rejoin with a new invite."
        confirmLabel="Remove member"
        pending={removeMember.isPending}
        error={removeMember.error}
        onConfirm={() => {
          if (!removing) return
          removeMember.mutate(
            { uid: removing.uid },
            {
              onSuccess: () => {
                toast({ title: 'Member removed', description: removing.uid, variant: 'success' })
                setRemoving(null)
              },
            },
          )
        }}
      />
    </Card>
  )
}
