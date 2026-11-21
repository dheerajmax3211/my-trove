import {
  Card,
  CardContent,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@platform/ui'
import { useSearchParams } from 'react-router-dom'
import type { Role } from '../../../api/types'
import { useHousehold } from '../../household/hooks/useHousehold'
import { DepositForm } from '../components/DepositForm'
import { SpendForm } from '../components/SpendForm'
import { SplitForm } from '../components/SplitForm'
import { TransferForm } from '../components/TransferForm'

type TabId = 'deposit' | 'spend' | 'transfer' | 'split'

const TABS: { id: TabId; label: string; roles: readonly Role[] }[] = [
  { id: 'deposit', label: 'Deposit', roles: ['OWNER', 'APPROVER', 'MEMBER'] },
  { id: 'spend', label: 'Spend', roles: ['OWNER', 'APPROVER', 'MEMBER', 'KID'] },
  { id: 'transfer', label: 'Transfer', roles: ['OWNER', 'APPROVER', 'MEMBER'] },
  { id: 'split', label: 'Split an expense', roles: ['OWNER', 'APPROVER'] },
]

/** All the ways to record money. Each tab is its own form, so each has its own idempotency key per visit. */
export function MovePage() {
  const { role, isKid } = useHousehold()
  const [params, setParams] = useSearchParams()
  const tabs = TABS.filter((t) => t.roles.includes(role))
  const requested = params.get('tab')
  const active = tabs.find((t) => t.id === requested)?.id ?? tabs[0]?.id ?? 'spend'

  return (
    <>
      <PageHeader
        title={isKid ? 'Spend from my pot' : 'Move money'}
        description="This records what happened. It does not move real money."
      />
      <Card>
        <CardContent>
          <Tabs value={active} onValueChange={(tab) => setParams({ tab }, { replace: true })}>
            <TabsList aria-label="Kind of entry">
              {tabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="deposit">
              <h2 className="ft-h2">Record a deposit</h2>
              <DepositForm />
            </TabsContent>
            <TabsContent value="spend">
              <h2 className="ft-h2">Record a spend</h2>
              <SpendForm />
            </TabsContent>
            <TabsContent value="transfer">
              <h2 className="ft-h2">Transfer between accounts</h2>
              <TransferForm />
            </TabsContent>
            <TabsContent value="split">
              <h2 className="ft-h2">Split an expense across pots</h2>
              <SplitForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  )
}
