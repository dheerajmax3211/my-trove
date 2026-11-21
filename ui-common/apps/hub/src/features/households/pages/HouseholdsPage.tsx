import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  PlusIcon,
  type DataTableColumn,
} from '@platform/ui'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../../../components/ErrorState'
import { formatDate } from '../../../lib/format'
import { usePageTitle } from '../../../lib/usePageTitle'
import { CreateHouseholdDialog } from '../components/CreateHouseholdDialog'
import { JoinHouseholdDialog } from '../components/JoinHouseholdDialog'
import { useHouseholds } from '../hooks'
import type { Household } from '../types'

const columns: DataTableColumn<Household>[] = [
  {
    id: 'name',
    header: 'Household',
    sortValue: (h) => h.name,
    cell: (h) => <Link to={`/households/${h.id}`}>{h.name}</Link>,
  },
  {
    id: 'role',
    header: 'Your role',
    sortValue: (h) => h.role,
    cell: (h) => (
      <Badge variant={h.role === 'OWNER' ? 'accent' : 'neutral'}>
        {h.role === 'OWNER' ? 'Owner' : 'Member'}
      </Badge>
    ),
  },
  {
    id: 'created',
    header: 'Created',
    sortValue: (h) => h.createdAt,
    cell: (h) => formatDate(h.createdAt),
  },
]

export function HouseholdsPage() {
  usePageTitle('Households')
  const households = useHouseholds()
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  const actions = (
    <>
      <Button variant="secondary" onClick={() => setJoinOpen(true)}>
        Join with a code
      </Button>
      <Button leftIcon={<PlusIcon size={18} />} onClick={() => setCreateOpen(true)}>
        Create household
      </Button>
    </>
  )

  return (
    <>
      <PageHeader
        eyebrow="Households"
        title="Households"
        description="Share reminders and files with the people you live with. Owners manage members and invites."
        actions={actions}
      />
      {households.isError ? (
        <ErrorState error={households.error} onRetry={() => void households.refetch()} />
      ) : (
        <DataTable
          caption="Your households"
          columns={columns}
          data={households.data ?? []}
          getRowId={(h) => h.id}
          loading={households.isPending}
          defaultSort={{ columnId: 'name', direction: 'asc' }}
          emptyState={
            <EmptyState
              headingAs="h2"
              title="You are not in a household yet"
              description="Create one for your family or flat, or join one with an invite code."
              action={
                <div className="hub-row">
                  <Button onClick={() => setCreateOpen(true)}>Create household</Button>
                  <Button variant="secondary" onClick={() => setJoinOpen(true)}>
                    Join with a code
                  </Button>
                </div>
              }
            />
          }
        />
      )}
      <CreateHouseholdDialog open={createOpen} onOpenChange={setCreateOpen} />
      <JoinHouseholdDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </>
  )
}
