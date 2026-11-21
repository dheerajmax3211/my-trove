import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { EntryView, StatementRow } from '../../../api/types'
import { MoneyText } from '../../../components/MoneyText'
import { formatDate } from '../../../lib/dates'
import { KIND_LABEL, summarizeEntry } from '../../money/entryUtils'
import { useHousehold } from '../hooks/useHousehold'

export function RecentEntries({ entries }: { entries: EntryView[] }) {
  const { accountName, currency, household } = useHousehold()
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <EmptyState
            headingAs="h3"
            title="Nothing recorded yet"
            description="Deposits, spends and transfers will show up here."
            action={<ModuleLink to={`/h/${household.id}/move`}>Record a deposit</ModuleLink>}
          />
        ) : (
          <ul className="ft-feed">
            {entries.map((e) => {
              const s = summarizeEntry(e, accountName)
              return (
                <li key={e.id}>
                  <div>
                    <strong>{e.description}</strong>
                    <span className="ft-muted">
                      {KIND_LABEL[e.kind]}: {s.from} to {s.to} on {formatDate(e.postedAt)}
                    </span>
                  </div>
                  <MoneyText minor={s.movedMinor} currency={currency} />
                </li>
              )
            })}
          </ul>
        )}
        <p>
          <ModuleLink to={`/h/${household.id}/activity`}>See all activity</ModuleLink>
        </p>
      </CardContent>
    </Card>
  )
}

/** Kids cannot read the entry log, so their recent activity comes from their own pot's statement. */
export function RecentStatementRows({
  rows,
  currency,
}: {
  rows: StatementRow[]
  currency: string
}) {
  const { household } = useHousehold()
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            headingAs="h3"
            title="Nothing here yet"
            description="Money added to or spent from your pot will show up here."
          />
        ) : (
          <ul className="ft-feed">
            {[...rows].reverse().map((r) => (
              <li key={`${r.entryId}-${r.seq}`}>
                <div>
                  <strong>{r.description}</strong>
                  <span className="ft-muted">{formatDate(r.postedAt)}</span>
                </div>
                <MoneyText minor={r.amountMinor} currency={currency} signed />
              </li>
            ))}
          </ul>
        )}
        <p>
          <ModuleLink to={`/h/${household.id}/statement`}>Open my statement</ModuleLink>
        </p>
      </CardContent>
    </Card>
  )
}
