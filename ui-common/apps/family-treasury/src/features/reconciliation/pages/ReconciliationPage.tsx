import type { ApiError } from '@platform/api-client'
import { Badge, Button, DataTable, PageHeader, type DataTableColumn } from '@platform/ui'
import { useMutation } from '@tanstack/react-query'
import { useTreasuryApi } from '../../../api/hooks'
import type { Drift, ReconciliationReport } from '../../../api/types'
import { AccessNotice } from '../../../components/AccessNotice'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { MoneyText } from '../../../components/MoneyText'
import { formatDateTime } from '../../../lib/dates'
import { useHousehold } from '../../household/hooks/useHousehold'

export function ReconciliationPage() {
  const h = useHousehold()
  const api = useTreasuryApi()
  const check = useMutation<ReconciliationReport, ApiError>({
    mutationFn: () => api.reconcile(h.household.id),
  })

  if (h.role !== 'OWNER') return <AccessNotice what="Reconciliation" to={`/h/${h.household.id}`} />

  const report = check.data
  const columns: DataTableColumn<Drift>[] = [
    {
      id: 'account',
      header: 'Account',
      cell: (d) => (
        <strong>{h.household.accounts.find((a) => a.id === d.accountId)?.name ?? d.code}</strong>
      ),
    },
    {
      id: 'projected',
      header: 'Balance shown',
      align: 'end',
      cell: (d) =>
        d.projectedMinor === null ? (
          'Missing'
        ) : (
          <MoneyText minor={d.projectedMinor} currency={h.currency} />
        ),
    },
    {
      id: 'ledger',
      header: 'Sum of ledger entries',
      align: 'end',
      cell: (d) => <MoneyText minor={d.ledgerMinor} currency={h.currency} />,
    },
    {
      id: 'drift',
      header: 'Difference',
      align: 'end',
      cell: (d) => <MoneyText minor={d.driftMinor} currency={h.currency} signed />,
    },
  ]

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Checks that every account's balance equals the sum of its ledger entries, and that the ledger balances to zero. It reports problems; it never changes anything."
        actions={
          <Button loading={check.isPending} onClick={() => check.mutate()}>
            {report ? 'Run the check again' : 'Run the check'}
          </Button>
        }
      />
      {check.isError ? (
        <ErrorNotice
          error={check.error}
          title="The check could not run"
          onRetry={() => check.mutate()}
        />
      ) : null}
      {report?.consistent ? (
        <div role="status" className="ft-notice ft-notice-success">
          <strong>Everything adds up.</strong>
          <p>
            All {report.accountsChecked} accounts match their ledger entries. Checked{' '}
            {formatDateTime(report.checkedAt)}.
          </p>
        </div>
      ) : null}
      {report && !report.consistent ? (
        <section aria-labelledby="drift-heading" className="ft-stack">
          <div role="alert" className="ft-notice ft-notice-danger">
            <strong id="drift-heading">
              Drift found in {report.drifts.length}{' '}
              {report.drifts.length === 1 ? 'account' : 'accounts'}
            </strong>
            <p>
              The balance shown does not match the ledger for the accounts below. Nothing has been
              changed. Checked {formatDateTime(report.checkedAt)}. Do not record more entries for
              these accounts until it is understood.
            </p>
          </div>
          {report.drifts.length > 0 ? (
            <DataTable
              caption="Accounts with drift"
              columns={columns}
              data={report.drifts}
              getRowId={(d) => d.accountId}
            />
          ) : null}
          {report.ledgerImbalances.length > 0 ? (
            <ul className="ft-plain-list">
              {report.ledgerImbalances.map((i) => (
                <li key={i.currency}>
                  <Badge variant="danger">Out of balance</Badge> The {i.currency} ledger sums to{' '}
                  <MoneyText minor={i.totalMinor} currency={i.currency} signed /> instead of zero.
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {report ? null : (
        <p className="ft-muted">
          Nothing has been checked in this visit yet. The check is safe to run any time.
        </p>
      )}
    </>
  )
}
