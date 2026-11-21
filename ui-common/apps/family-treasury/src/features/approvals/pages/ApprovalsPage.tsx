import { EmptyState, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { QueryState } from '../../../components/QueryState'
import { useHousehold } from '../../household/hooks/useHousehold'
import { ApprovalCard } from '../components/ApprovalCard'
import { PENDING, useApprovals } from '../hooks'

export function ApprovalsPage() {
  const h = useHousehold()
  const approvals = useApprovals(h.household.id, null)
  const threshold = h.household.approvalThresholdMinor
  return (
    <>
      <PageHeader
        title={h.isKid ? 'My requests' : 'Approvals'}
        description={
          h.isKid
            ? 'Bigger spends need a grown-up to approve them. You can see how your requests are doing here.'
            : threshold === null
              ? 'This household has no approval limit, so nothing waits here.'
              : 'Spends above the household limit wait here until another owner or approver decides. Nobody can approve their own request.'
        }
      />
      <QueryState
        query={approvals}
        loadingLabel="Loading requests"
        errorTitle="We could not load the requests"
      >
        {(list) => {
          const pending = list.filter((a) => a.status === PENDING)
          const history = list.filter((a) => a.status !== PENDING)
          return (
            <Tabs defaultValue="pending">
              <TabsList aria-label="Request filter">
                <TabsTrigger value="pending">Needs a decision ({pending.length})</TabsTrigger>
                <TabsTrigger value="history">History ({history.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="pending">
                {pending.length === 0 ? (
                  <EmptyState
                    title="Nothing waiting"
                    description="When a spend is above the approval limit, it will show up here."
                    action={
                      <ModuleLink to={`/h/${h.household.id}/move?tab=spend`}>
                        Record a spend
                      </ModuleLink>
                    }
                  />
                ) : (
                  <ul className="ft-stack ft-plain-list">
                    {pending.map((a) => (
                      <li key={a.id}>
                        <ApprovalCard approval={a} />
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="history">
                {history.length === 0 ? (
                  <EmptyState
                    title="No past requests"
                    description="Approved, rejected and expired requests are kept here."
                  />
                ) : (
                  <ul className="ft-stack ft-plain-list">
                    {history.map((a) => (
                      <li key={a.id}>
                        <ApprovalCard approval={a} />
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          )
        }}
      </QueryState>
    </>
  )
}
