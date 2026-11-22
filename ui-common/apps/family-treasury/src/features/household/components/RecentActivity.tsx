import {
  BentoCard,
  Button,
  ClockIcon,
  EmptyState,
  Illustration,
  Timeline,
  type TimelineItem,
  type TimelineTone,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import type { Slot } from '../../../components/CardState'
import type { EntryKind, EntryView, StatementRow } from '../../../api/types'
import { MoneyText } from '../../../components/MoneyText'
import { formatDate } from '../../../lib/dates'
import { KIND_LABEL, summarizeEntry } from '../../money/entryUtils'
import { useHousehold } from '../hooks/useHousehold'

const TONE: Record<EntryKind, TimelineTone> = {
  DEPOSIT: 'success',
  SPEND: 'neutral',
  TRANSFER: 'accent',
  SPLIT: 'accent',
  REVERSAL: 'warning',
  ALLOWANCE: 'brass',
}

function Line({ text, amount, signed }: { text: string; amount: number; signed?: boolean }) {
  const { currency } = useHousehold()
  return (
    <span className="ft-line">
      <span className="ft-line-text">{text}</span>
      <MoneyText minor={amount} currency={currency} signed={signed ?? false} />
    </span>
  )
}

/** The latest ledger entries as a readable timeline: what happened, between whom, how much. */
export function RecentEntries({
  entries,
  span = 7,
  className,
  style,
}: { entries: EntryView[]; span?: number } & Slot) {
  const { accountName, household, memberName } = useHousehold()
  const items: TimelineItem[] = entries.map((e) => {
    const s = summarizeEntry(e, accountName)
    return {
      id: e.id,
      tone: TONE[e.kind],
      title: <Line text={e.description} amount={s.movedMinor} />,
      description: `${KIND_LABEL[e.kind]}: ${s.from} to ${s.to}. Recorded by ${memberName(e.createdByUid)}.`,
      time: formatDate(e.postedAt),
      dateTime: e.postedAt,
    }
  })
  return (
    <BentoCard
      span={span}
      title="Recent activity"
      icon={<ClockIcon size={18} />}
      className={className}
      {...(style ? { style } : {})}
    >
      {entries.length === 0 ? (
        <EmptyState
          illustration={<Illustration name="empty" size={180} />}
          headingAs="h3"
          title="Nothing recorded yet"
          description="Deposits, spends and transfers will show up here, newest first."
          action={
            <Button asChild>
              <ModuleLink to={`/h/${household.id}/move?tab=deposit`}>Record a deposit</ModuleLink>
            </Button>
          }
        />
      ) : (
        <Timeline items={items} label="Recent ledger entries" />
      )}
      {entries.length > 0 ? (
        <p>
          <ModuleLink to={`/h/${household.id}/activity`}>See all activity</ModuleLink>
        </p>
      ) : null}
    </BentoCard>
  )
}

/** Kids cannot read the entry log, so their recent activity comes from their own pot's statement. */
export function RecentStatementRows({
  rows,
  currency,
  span = 12,
  className,
  style,
}: {
  rows: StatementRow[]
  currency: string
  span?: number
} & Slot) {
  const { household } = useHousehold()
  const items: TimelineItem[] = [...rows].reverse().map((r) => ({
    id: `${r.entryId}-${r.seq}`,
    tone: r.amountMinor < 0 ? 'neutral' : 'success',
    title: (
      <span className="ft-line">
        <span className="ft-line-text">{r.description}</span>
        <MoneyText minor={r.amountMinor} currency={currency} signed />
      </span>
    ),
    time: formatDate(r.postedAt),
    dateTime: r.postedAt,
  }))
  return (
    <BentoCard
      span={span}
      title="Recent activity"
      icon={<ClockIcon size={18} />}
      className={className}
      {...(style ? { style } : {})}
    >
      {rows.length === 0 ? (
        <EmptyState
          illustration={<Illustration name="empty" size={180} />}
          headingAs="h3"
          title="Nothing here yet"
          description="Money added to or spent from your pot will show up here."
        />
      ) : (
        <Timeline items={items} label="Recent activity in my pot" />
      )}
      <p>
        <ModuleLink to={`/h/${household.id}/statement`}>Open my statement</ModuleLink>
      </p>
    </BentoCard>
  )
}
