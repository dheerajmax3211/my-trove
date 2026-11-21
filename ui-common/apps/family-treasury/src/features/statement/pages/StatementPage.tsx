import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  useToast,
  type DataTableColumn,
} from '@platform/ui'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { StatementRow } from '../../../api/types'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { MoneyText } from '../../../components/MoneyText'
import { QueryState } from '../../../components/QueryState'
import { useTreasuryApi } from '../../../api/hooks'
import { localDayEndExclusiveIso, localDayStartIso, formatDateTime } from '../../../lib/dates'
import { downloadTextFile } from '../../../lib/download'
import { useHousehold } from '../../household/hooks/useHousehold'
import { KIND_LABEL } from '../../money/entryUtils'
import { useStatement } from '../hooks'

const SIZES = [10, 25, 50]

export function StatementPage() {
  const h = useHousehold()
  const api = useTreasuryApi()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<unknown>(null)

  const defaultAccount = (h.isKid ? h.myPot : (h.pool ?? h.accounts[0]))?.id ?? ''
  const requested = params.get('account')
  const accountId = h.accounts.some((a) => a.id === requested) ? (requested ?? '') : defaultAccount
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const size = SIZES.includes(Number(params.get('size'))) ? Number(params.get('size')) : SIZES[0]!
  const page = Math.max(0, Number(params.get('page') ?? '0') || 0)

  const range = {
    from: from ? localDayStartIso(from) : undefined,
    to: to ? localDayEndExclusiveIso(to) : undefined,
  }
  const statement = useStatement(h.household.id, accountId, { ...range, page, size })

  const patch = (changes: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    if (resetPage) next.delete('page')
    setParams(next, { replace: true })
  }

  const exportCsv = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const csv = await api.statementCsv(h.household.id, accountId, range)
      const code = h.accounts.find((a) => a.id === accountId)?.code ?? 'account'
      downloadTextFile(`statement-${code.replace(/[^A-Za-z0-9_-]+/g, '-')}.csv`, csv, 'text/csv')
      toast({
        title: 'Statement exported',
        description: 'The CSV includes every row in the date range.',
        variant: 'success',
      })
    } catch (error) {
      setExportError(error)
    } finally {
      setExporting(false)
    }
  }

  const accountOptions = [...h.accounts].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <>
      <PageHeader
        title={h.isKid ? 'My statement' : 'Statements'}
        description="Every posting to an account with the balance after it. Balances are always the full running total, even when you filter by date."
        actions={
          <Button
            variant="secondary"
            loading={exporting}
            disabled={accountId === ''}
            onClick={() => void exportCsv()}
          >
            Export CSV
          </Button>
        }
      />
      <form
        className="ft-filters"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Statement filters"
      >
        {h.isKid ? null : (
          <Field label="Account">
            <Select value={accountId} onChange={(e) => patch({ account: e.target.value })}>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="From date">
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => patch({ from: e.target.value })}
          />
        </Field>
        <Field label="To date" description="Includes this whole day.">
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => patch({ to: e.target.value })}
          />
        </Field>
        <Field label="Rows per page">
          <Select value={String(size)} onChange={(e) => patch({ size: e.target.value })}>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        {from || to ? (
          <Button type="button" variant="ghost" onClick={() => patch({ from: null, to: null })}>
            Clear dates
          </Button>
        ) : null}
      </form>
      {exportError ? <ErrorNotice error={exportError} title="The export failed" /> : null}

      {accountId === '' ? (
        <EmptyState
          title="No account to show"
          description="You do not have an account with a statement yet."
        />
      ) : (
        <QueryState
          query={statement}
          loadingLabel="Loading statement"
          errorTitle="We could not load the statement"
        >
          {(s) => {
            const pages = Math.max(1, Math.ceil(s.totalRows / s.size))
            const first = s.totalRows === 0 ? 0 : s.page * s.size + 1
            const last = Math.min(s.totalRows, (s.page + 1) * s.size)
            const columns: DataTableColumn<StatementRow>[] = [
              { id: 'date', header: 'Date', cell: (r) => formatDateTime(r.postedAt) },
              { id: 'kind', header: 'Kind', cell: (r) => <Badge>{KIND_LABEL[r.kind]}</Badge> },
              { id: 'description', header: 'Description', cell: (r) => r.description },
              {
                id: 'amount',
                header: 'Amount',
                align: 'end',
                cell: (r) => <MoneyText minor={r.amountMinor} currency={s.currency} signed />,
              },
              {
                id: 'balance',
                header: 'Balance',
                align: 'end',
                cell: (r) => <MoneyText minor={r.balanceMinor} currency={s.currency} />,
              },
            ]
            return (
              <>
                <p className="ft-statement-balance">
                  Current balance of <strong>{h.accountName(s.accountId)}</strong>:{' '}
                  <MoneyText minor={s.currentBalanceMinor} currency={s.currency} />
                </p>
                <DataTable
                  caption={`Statement for ${h.accountName(s.accountId)}`}
                  columns={columns}
                  data={s.rows}
                  getRowId={(r) => `${r.entryId}-${r.seq}`}
                  emptyState={
                    <EmptyState
                      headingAs="h2"
                      title="No entries in this range"
                      description={
                        from || to
                          ? 'Try a wider date range.'
                          : 'Nothing has been posted to this account yet.'
                      }
                      action={
                        from || to ? (
                          <Button onClick={() => patch({ from: null, to: null })}>
                            Clear dates
                          </Button>
                        ) : undefined
                      }
                    />
                  }
                />
                <nav className="ft-pager" aria-label="Statement pages">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={s.page === 0}
                    onClick={() => patch({ page: String(s.page - 1) }, false)}
                  >
                    Previous
                  </Button>
                  <span>
                    {first}-{last} of {s.totalRows} (page {s.page + 1} of {pages})
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={s.page + 1 >= pages}
                    onClick={() => patch({ page: String(s.page + 1) }, false)}
                  >
                    Next
                  </Button>
                </nav>
              </>
            )
          }}
        </QueryState>
      )}
    </>
  )
}
