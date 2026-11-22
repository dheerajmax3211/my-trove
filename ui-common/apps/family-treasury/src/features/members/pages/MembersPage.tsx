import { DataTable, PageHeader, Select, useToast, type DataTableColumn } from '@platform/ui'
import { useGuardedMutation } from '../../../api/hooks'
import { ROLES, type MemberView, type Role } from '../../../api/types'
import { AccessNotice } from '../../../components/AccessNotice'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { MoneyText } from '../../../components/MoneyText'
import { ROLE_LABEL, RoleBadge } from '../../../components/RoleBadge'
import { useHousehold } from '../../household/hooks/useHousehold'
import { InvitesCard } from '../components/InvitesCard'
import { RoleMatrix } from '../components/RoleMatrix'
import { SettingsCard } from '../components/SettingsCard'

function RoleSelect({ member }: { member: MemberView }) {
  const h = useHousehold()
  const { toast } = useToast()
  const { mutation, submit } = useGuardedMutation<MemberView, Role>({
    run: (api, role) => api.changeRole(h.household.id, member.uid, role),
    householdId: h.household.id,
    onSuccess: (m) =>
      toast({
        title: 'Role changed',
        description: `${m.displayName ?? m.uid} is now ${ROLE_LABEL[m.role]}.`,
        variant: 'success',
      }),
  })
  const label = member.displayName ?? member.uid
  return (
    <div>
      <Select
        size="sm"
        aria-label={`Role for ${label}`}
        value={member.role}
        disabled={mutation.isPending}
        onChange={(e) => submit(e.target.value as Role)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </Select>
      {mutation.error ? <ErrorNotice error={mutation.error} /> : null}
    </div>
  )
}

export function MembersPage() {
  const h = useHousehold()
  const isOwner = h.role === 'OWNER'
  if (h.isKid) return <AccessNotice what="Members and roles" to={`/h/${h.household.id}`} />

  const columns: DataTableColumn<MemberView>[] = [
    {
      id: 'name',
      header: 'Member',
      cell: (m) => (
        <>
          <strong>{m.displayName ?? m.uid}</strong>
          {m.uid === h.me.uid ? <span className="ft-muted"> (you)</span> : null}
        </>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      cell: (m) => (isOwner ? <RoleSelect member={m} /> : <RoleBadge role={m.role} />),
    },
    {
      id: 'pot',
      header: 'Pot balance',
      align: 'end',
      cell: (m) => {
        const pot = h.pots.find((p) => p.ownerUid === m.uid)
        return pot ? <MoneyText minor={pot.balanceMinor} currency={h.currency} /> : 'None'
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="Members and roles"
        description="Who is in this household and what each role is allowed to do. Owners invite people with a code."
      />
      <DataTable
        caption="Household members"
        columns={columns}
        data={h.household.members}
        getRowId={(m) => m.uid}
      />
      {isOwner ? <InvitesCard /> : null}
      {isOwner ? <SettingsCard /> : null}
      <RoleMatrix />
    </>
  )
}
