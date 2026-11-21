import {
  Badge,
  Button,
  EmptyState,
  IllustrationEmpty,
  PageHeader,
  PlusIcon,
  Skeleton,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useState } from 'react'
import { ErrorState } from '../../../components/ErrorState'
import { AvatarStack } from '../../../components/People'
import { formatDate } from '../../../lib/format'
import { usePageTitle } from '../../../lib/usePageTitle'
import { CreateHouseholdDialog } from '../components/CreateHouseholdDialog'
import { JoinHouseholdDialog } from '../components/JoinHouseholdDialog'
import { useHouseholdDetails, useHouseholds } from '../hooks'
import styles from './Households.module.css'

export function HouseholdsPage() {
  usePageTitle('Households')
  const households = useHouseholds()
  const list = households.data ?? []
  const details = useHouseholdDetails(list.map((h) => h.id))
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
      ) : households.isPending ? (
        <div className={styles.loading} aria-busy="true" aria-label="Loading households">
          <Skeleton height={72} />
          <Skeleton height={72} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          illustration={<IllustrationEmpty />}
          headingAs="h2"
          title="You are not in a household yet"
          description="Create one for your family or flat, or join one with an invite code. Reminders and files you add to a household are visible to every member."
          action={
            <div className="hub-row">
              <Button onClick={() => setCreateOpen(true)}>Create household</Button>
              <Button variant="secondary" onClick={() => setJoinOpen(true)}>
                Join with a code
              </Button>
            </div>
          }
        />
      ) : (
        <ul className={styles.list} aria-label="Your households">
          {list.map((h, i) => {
            const members = details[i]?.data?.members ?? []
            return (
              <li key={h.id} className={styles.row}>
                <div className={styles.main}>
                  <ModuleLink to={`/households/${h.id}`} className={styles.name}>
                    {h.name}
                  </ModuleLink>
                  <span className={styles.meta}>
                    Created {formatDate(h.createdAt)}
                    {members.length > 0
                      ? `, ${members.length} ${members.length === 1 ? 'person' : 'people'}`
                      : ''}
                  </span>
                </div>
                {members.length > 0 ? <AvatarStack uids={members.map((m) => m.uid)} /> : null}
                <Badge variant={h.role === 'OWNER' ? 'accent' : 'neutral'}>
                  {h.role === 'OWNER' ? 'Owner' : 'Member'}
                </Badge>
              </li>
            )
          })}
        </ul>
      )}
      <CreateHouseholdDialog open={createOpen} onOpenChange={setCreateOpen} />
      <JoinHouseholdDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </>
  )
}
