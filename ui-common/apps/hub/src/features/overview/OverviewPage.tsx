import {
  Badge,
  Button,
  Callout,
  EmptyState,
  PageHeader,
  Skeleton,
  Stat,
  Timeline,
  type TimelineItem,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { useMemo, type ReactNode } from 'react'
import { AvatarStack, PersonLabel } from '../../components/People'
import { ErrorState } from '../../components/ErrorState'
import { scopeName } from '../../components/ScopeSelect'
import { useCoreEnv } from '../../core/env'
import { usePeople } from '../../core/people'
import { formatDate } from '../../lib/format'
import { formatWhen, groupFor } from '../../lib/day'
import { usePageTitle } from '../../lib/usePageTitle'
import { describeEvent } from '../activity/sentence'
import { KindIcon } from '../activity/KindIcon'
import { useAudit } from '../activity/hooks'
import { useFiles } from '../files/hooks'
import { useHouseholdDetails, useHouseholds } from '../households/hooks'
import type { Household, HouseholdDetail } from '../households/types'
import { useReminders } from '../reminders/hooks'
import type { Reminder } from '../reminders/types'
import { FirstRun } from './FirstRun'
import { nextStep } from './nextStep'
import styles from './Overview.module.css'

const DEFAULT_HEADER = {
  title: 'Your household',
  description: 'The people you share with, and what you share.',
}

const WEEK_MS = 7 * 86_400_000

/** The household the page leads with: one you own, otherwise the oldest you belong to. */
export function pickPrimary(households: readonly Household[]): Household | undefined {
  const byAge = [...households].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return byAge.find((h) => h.role === 'OWNER') ?? byAge[0]
}

function Loading() {
  return (
    <div className={styles.loading} aria-busy="true" aria-label="Loading your household">
      <Skeleton height={220} />
      <Skeleton height={96} />
      <Skeleton height={160} />
    </div>
  )
}

function HouseholdPanel({
  household,
  detail,
  step,
}: {
  household: Household
  detail: HouseholdDetail | undefined
  step: ReturnType<typeof nextStep> | null
}) {
  const people = usePeople()
  const members = detail?.members ?? []
  const others = members.filter((m) => !people.isSelf(m.uid))
  const together =
    detail === undefined
      ? ''
      : others.length === 0
        ? 'Only you so far.'
        : `You share it with ${joinNames(others.map((m) => people.plainNameOf(m.uid)))}.`
  return (
    <section className={styles.vault} data-surface="vault" aria-labelledby="household-panel-title">
      <div className={styles.vaultHead}>
        <h2 id="household-panel-title" className={styles.vaultTitle}>
          {household.name}
        </h2>
        <Badge variant={household.role === 'OWNER' ? 'accent' : 'neutral'}>
          {household.role === 'OWNER' ? 'Owner' : 'Member'}
        </Badge>
      </div>
      <p className={styles.vaultMeta}>
        Created {formatDate(household.createdAt)}. {together}
      </p>
      {members.length > 0 ? (
        <ul className={styles.people} aria-label="Members">
          {members.map((m) => (
            <li key={m.uid} className={styles.person}>
              <PersonLabel uid={m.uid} size="md" />
              <span className={styles.personRole}>{m.role === 'OWNER' ? 'Owner' : 'Member'}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.vaultFoot}>
        {step ? (
          <div className={styles.next}>
            <p className={styles.nextText}>{step.text}</p>
            <Button asChild>
              <ModuleLink to={step.to}>{step.label}</ModuleLink>
            </Button>
          </div>
        ) : null}
        <Button variant="secondary" asChild>
          <ModuleLink to={`/households/${household.id}`}>Open household</ModuleLink>
        </Button>
      </div>
    </section>
  )
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function ComingUp({
  reminders,
  households,
  loading,
}: {
  reminders: readonly Reminder[]
  households: readonly Household[]
  loading: boolean
}) {
  const { now } = useCoreEnv()
  const nowMs = now()
  const upcoming = [...reminders].sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 4)
  return (
    <section className={styles.panel} aria-labelledby="coming-up-title">
      <div className={styles.panelHead}>
        <h2 id="coming-up-title" className={styles.panelTitle}>
          Coming up
        </h2>
        <ModuleLink to="/reminders">All reminders</ModuleLink>
      </div>
      {loading ? (
        <Skeleton height={96} />
      ) : upcoming.length === 0 ? (
        <EmptyState
          headingAs="h3"
          title="Nothing due"
          description="Add a reminder and it will show up here, for you or for the whole household."
          action={
            <Button variant="secondary" asChild>
              <ModuleLink to="/reminders">Add a reminder</ModuleLink>
            </Button>
          }
        />
      ) : (
        <ul className={styles.agenda}>
          {upcoming.map((r) => {
            const overdue = groupFor(new Date(r.dueAt).getTime(), nowMs, true) === 'overdue'
            return (
              <li key={r.id} className={styles.agendaItem}>
                <span className={styles.agendaTitle}>{r.title}</span>
                <span className={overdue ? styles.agendaLate : styles.agendaWhen}>
                  {overdue ? 'Overdue, ' : ''}
                  {formatWhen(new Date(r.dueAt).getTime(), nowMs)}
                </span>
                <span className={styles.agendaScope}>{scopeName(r.householdId, households)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Lately({ household }: { household: Household }) {
  const people = usePeople()
  const audit = useAudit({ householdId: household.id, size: 5 })
  const items: TimelineItem[] = (audit.data?.items ?? []).map((event) => {
    const sentence = describeEvent(event, people.nameOf)
    return {
      id: event.id,
      title: sentence.title,
      ...(sentence.description ? { description: sentence.description } : {}),
      time: formatDate(event.createdAt),
      dateTime: event.createdAt,
      tone: sentence.tone,
      icon: <KindIcon kind={sentence.kind} />,
    }
  })
  return (
    <section className={styles.panel} aria-labelledby="lately-title">
      <div className={styles.panelHead}>
        <h2 id="lately-title" className={styles.panelTitle}>
          Lately in {household.name}
        </h2>
        <ModuleLink to={`/activity?household=${household.id}`}>All activity</ModuleLink>
      </div>
      {audit.isPending ? (
        <Skeleton height={96} />
      ) : audit.isError ? (
        <ErrorState error={audit.error} onRetry={() => void audit.refetch()} headingAs="h3" />
      ) : items.length === 0 ? (
        <p className={styles.quiet}>Nothing has happened here yet.</p>
      ) : (
        <Timeline items={items} compact label={`Recent activity in ${household.name}`} />
      )}
    </section>
  )
}

/** The module's home: who you share with, what is shared, and the one thing to do next. */
export function OverviewPage({
  footer,
  header,
}: {
  footer?: ReactNode
  /** Replaces the title and standfirst (the standalone hub greets the signed-in person). */
  header?: { title: string; description: ReactNode }
}) {
  usePageTitle('Overview')
  const { now } = useCoreEnv()
  const people = usePeople()
  const households = useHouseholds()
  const list = useMemo(() => households.data ?? [], [households.data])
  const primary = pickPrimary(list)
  const details = useHouseholdDetails(list.map((h) => h.id))
  const reminders = useReminders({ status: 'ACTIVE' })
  const files = useFiles()

  if (households.isPending)
    return (
      <>
        <PageHeader {...(header ?? DEFAULT_HEADER)} />
        <Loading />
        {footer}
      </>
    )
  if (households.isError)
    return (
      <>
        <PageHeader {...(header ?? DEFAULT_HEADER)} />
        <ErrorState error={households.error} onRetry={() => void households.refetch()} />
        {footer}
      </>
    )
  if (!primary)
    return (
      <>
        <PageHeader
          {...(header ?? {
            title: 'Welcome',
            description: 'Households, reminders and files, shared with the people you choose.',
          })}
        />
        <FirstRun />
        {footer}
      </>
    )

  const nowMs = now()
  const allReminders = reminders.data ?? []
  const detailOf = (id: string) => details[list.findIndex((h) => h.id === id)]?.data
  const primaryDetail = detailOf(primary.id)
  const householdReminders = allReminders.filter((r) => r.householdId === primary.id)
  const householdFiles = (files.data ?? []).filter((f) => f.householdId === primary.id)
  const dueThisWeek = allReminders.filter((r) => new Date(r.dueAt).getTime() <= nowMs + WEEK_MS)
  const overdue = allReminders.filter((r) => new Date(r.dueAt).getTime() < nowMs)
  const sharedFiles = (files.data ?? []).filter((f) => f.householdId !== null)
  const peopleCount = new Set(
    details.flatMap((d) =>
      d.data ? d.data.members.map((m) => m.uid).filter((uid) => !people.isSelf(uid)) : [],
    ),
  ).size
  const soonest = [...householdReminders].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
  const step =
    primaryDetail && !reminders.isPending && !files.isPending
      ? nextStep({
          householdId: primary.id,
          callerRole: primary.role,
          memberCount: primaryDetail.members.length,
          activeReminders: householdReminders.length,
          files: householdFiles.length,
          nextReminderTitle: soonest?.title,
        })
      : null
  const others = list.filter((h) => h.id !== primary.id)

  return (
    <>
      <PageHeader
        {...(header ?? {
          title: list.length > 1 ? 'Your households' : 'Your household',
          description: DEFAULT_HEADER.description,
        })}
        actions={
          <Button variant="secondary" asChild>
            <ModuleLink to="/households">All households</ModuleLink>
          </Button>
        }
      />
      <div className={styles.page}>
        <HouseholdPanel household={primary} detail={primaryDetail} step={step} />

        {overdue.length > 0 ? (
          <Callout
            variant="warning"
            title={
              overdue.length === 1
                ? '1 reminder is overdue'
                : `${overdue.length} reminders are overdue`
            }
            action={
              <Button size="sm" variant="secondary" asChild>
                <ModuleLink to="/reminders">Open reminders</ModuleLink>
              </Button>
            }
          >
            {overdue
              .slice(0, 3)
              .map((r) => r.title)
              .join(', ')}
            {overdue.length > 3 ? ' and more' : ''}.
          </Callout>
        ) : null}

        <section className={styles.stats} aria-label="At a glance">
          <Stat
            label="People you share with"
            value={String(peopleCount)}
            hint={list.length > 1 ? `across ${list.length} households` : 'besides you'}
          />
          <Stat
            label="Reminders due this week"
            value={String(dueThisWeek.length)}
            hint={overdue.length > 0 ? `${overdue.length} overdue` : 'none overdue'}
          />
          <Stat
            label="Files shared"
            value={String(sharedFiles.length)}
            hint={sharedFiles.length === 1 ? 'saved to a household' : 'saved to households'}
          />
        </section>

        <div className={styles.columns}>
          <ComingUp reminders={allReminders} households={list} loading={reminders.isPending} />
          <Lately household={primary} />
        </div>

        {others.length > 0 ? (
          <section className={styles.panel} aria-labelledby="others-title">
            <h2 id="others-title" className={styles.panelTitle}>
              Your other households
            </h2>
            <ul className={styles.others}>
              {others.map((h) => (
                <li key={h.id}>
                  <ModuleLink to={`/households/${h.id}`} className={styles.otherLink}>
                    <span>{h.name}</span>
                    <AvatarStack uids={detailOf(h.id)?.members.map((m) => m.uid) ?? []} />
                  </ModuleLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {footer}
      </div>
    </>
  )
}
