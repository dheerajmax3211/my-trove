import { Callout, DataTable, type DataTableColumn } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { Screen } from '../components/common'
import shared from '../components/shared.module.css'
import { PERMISSIONS, PLAN_TABLE } from '../lib/catalogue'
import { formatInt } from '../lib/format'

type PlanRow = (typeof PLAN_TABLE)[number]

const columns: DataTableColumn<PlanRow>[] = [
  { id: 'plan', header: 'Plan', cell: (p) => <strong>{p.plan}</strong> },
  {
    id: 'minute',
    header: 'Requests per minute',
    align: 'end',
    cell: (p) => <span className={shared.num}>{formatInt(p.requestsPerMinute)}</span>,
  },
  {
    id: 'month',
    header: 'Requests per month',
    align: 'end',
    cell: (p) => <span className={shared.num}>{formatInt(p.requestsPerMonth)}</span>,
  },
  { id: 'for', header: 'For', cell: (p) => <span className={shared.muted}>{p.blurb}</span> },
]

export function PlansScreen() {
  return (
    <Screen
      title="Plans"
      area="Plans"
      permission={PERMISSIONS.usageReadAll}
      description="The three plans and the limits the gateway applies to each."
    >
      <div className={shared.stack}>
        <DataTable
          caption="Plans and their limits"
          columns={columns}
          data={PLAN_TABLE}
          getRowId={(p) => p.plan}
        />
        <Callout variant="note" title="Billing is simulated">
          A plan sets how many requests a person can make; it does not charge anyone and no payment
          details are collected. The limits above are fixed in the platform and are not editable
          here. To move someone to a different plan, open them from{' '}
          <ModuleLink to="/users" className={shared.link}>
            Users
          </ModuleLink>{' '}
          (owners only).
        </Callout>
      </div>
    </Screen>
  )
}
