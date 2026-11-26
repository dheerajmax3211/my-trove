import { Badge, Button, type BadgeVariant } from '@platform/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TOOL_PRODUCT, householdNamedIn, type ToolName } from './intent'
import {
  parseAppliances,
  parseFollowUps,
  parseLedger,
  parseSearch,
  type LedgerHousehold,
} from './tools'
import styles from './Assistant.module.css'

const base = (tool: ToolName) => `/app/${TOOL_PRODUCT[tool].moduleId}`

const sentenceCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replace(/_/g, ' ')

/** `2026-11-18` is a calendar date (read it as local midnight); anything longer is an instant. */
function shortDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function money(amount: string | number, currency: string | null): string {
  const value = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(value)) return String(amount)
  if (!currency) return value.toFixed(2)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

interface AnswerProps {
  tool: ToolName
  data: unknown
  question: string
  /** Called when a link in the answer is followed (the panel closes). */
  onNavigate: () => void
  /** Family Treasury, more than one household: the person picked one. */
  onChooseHousehold: (household: { id: string; name: string }) => void
}

function Lead({ children }: { children: ReactNode }) {
  return <p className={styles.lead}>{children}</p>
}

function MoreLink({
  to,
  children,
  onNavigate,
}: {
  to: string
  children: ReactNode
  onNavigate: () => void
}) {
  return (
    <p className={styles.more}>
      <Link to={to} onClick={onNavigate}>
        {children}
      </Link>
    </p>
  )
}

const ACTIONS: Record<string, string> = {
  NUDGE: 'a nudge',
  ESCALATE: 'an escalation',
  FINAL_NOTICE: 'a final notice',
  EXPIRE: 'it expires',
}

function FollowUpsAnswer({ data, onNavigate }: AnswerProps) {
  const answer = parseFollowUps(data)
  if (!answer) return <Unreadable tool="waiting_on_list_followups" />
  const tool = 'waiting_on_list_followups'
  if (answer.items.length === 0) {
    return <Lead>You aren&apos;t waiting on anything right now.</Lead>
  }
  return (
    <>
      <Lead>You&apos;re waiting on {plural(answer.items.length, 'thing', 'things')}.</Lead>
      <ul className={styles.rows}>
        {answer.items.map((item) => {
          const expected = shortDate(item.expectedBy)
          const next = item.nextStep
          const nextAt = shortDate(next?.at ?? null)
          const meta = [
            item.counterparty,
            sentenceCase(item.status),
            expected ? `expected ${expected}` : null,
            item.amount ? money(item.amount, item.currency) : null,
          ].filter(Boolean)
          return (
            <li key={item.id} className={styles.row}>
              <Link
                to={`${base(tool)}/items/${item.id}`}
                onClick={onNavigate}
                className={styles.rowTitle}
              >
                {item.title}
              </Link>
              <span className={styles.meta}>{meta.join(' · ')}</span>
              {next?.action && next.action !== 'NONE' ? (
                <span className={styles.meta}>
                  Next: {ACTIONS[next.action] ?? sentenceCase(next.action)}
                  {nextAt ? ` on ${nextAt}` : ''}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
      <MoreLink to={base(tool)} onNavigate={onNavigate}>
        Open Waiting On
      </MoreLink>
    </>
  )
}

function SearchAnswerView({ data, question, onNavigate }: AnswerProps) {
  const answer = parseSearch(data)
  if (!answer) return <Unreadable tool="ask_your_life_search" />
  const tool = 'ask_your_life_search'
  const query = answer.query || question
  const searchLink = `${base(tool)}?q=${encodeURIComponent(query)}`
  const [best, ...rest] = answer.passages
  if (!best) {
    return (
      <>
        <Lead>Nothing in your notes, documents or receipts matches that.</Lead>
        <MoreLink to={`${base(tool)}/add`} onNavigate={onNavigate}>
          Add something to Ask Your Life
        </MoreLink>
      </>
    )
  }
  return (
    <>
      <Lead>The best match in your documents:</Lead>
      <figure className={styles.quote}>
        <blockquote>
          <p>&ldquo;{best.passage}&rdquo;</p>
        </blockquote>
        <figcaption>
          From <cite>{best.title}</cite>
        </figcaption>
      </figure>
      {rest.length > 0 ? (
        <p className={styles.meta}>
          Also mentioned in: {rest.map((passage) => passage.title).join(', ')}
        </p>
      ) : null}
      <MoreLink to={searchLink} onNavigate={onNavigate}>
        See every result in Ask Your Life
      </MoreLink>
    </>
  )
}

const HEALTH: Record<string, { label: string; variant: BadgeVariant }> = {
  HEALTHY: { label: 'Healthy', variant: 'success' },
  WARNING: { label: 'Warning', variant: 'warning' },
  CRITICAL: { label: 'Critical', variant: 'danger' },
  LEARNING: { label: 'Learning', variant: 'info' },
  NO_DEVICE: { label: 'No device', variant: 'neutral' },
}

function AppliancesAnswer({ data, onNavigate }: AnswerProps) {
  const answer = parseAppliances(data)
  if (!answer) return <Unreadable tool="home_pulse_appliance_status" />
  const tool = 'home_pulse_appliance_status'
  if (answer.appliances.length === 0) {
    return (
      <>
        <Lead>You haven&apos;t added any appliances to Home Pulse yet.</Lead>
        <MoreLink to={`${base(tool)}/appliances/new`} onNavigate={onNavigate}>
          Add an appliance
        </MoreLink>
      </>
    )
  }
  const attention = answer.appliances.filter(
    (appliance) =>
      appliance.health === 'WARNING' ||
      appliance.health === 'CRITICAL' ||
      appliance.openAlerts.length > 0,
  ).length
  const total = answer.appliances.length
  return (
    <>
      <Lead>
        {attention === 0
          ? total === 1
            ? 'Your appliance looks fine.'
            : `All ${total} appliances look fine.`
          : `${attention} of ${plural(total, 'appliance', 'appliances')} ${attention === 1 ? 'needs' : 'need'} attention.`}
      </Lead>
      <ul className={styles.rows}>
        {answer.appliances.map((appliance) => {
          const health = HEALTH[appliance.health] ?? {
            label: 'Unknown',
            variant: 'neutral' as const,
          }
          return (
            <li key={appliance.id} className={styles.row}>
              <span className={styles.rowHead}>
                <Link
                  to={`${base(tool)}/appliances/${appliance.id}`}
                  onClick={onNavigate}
                  className={styles.rowTitle}
                >
                  {appliance.name}
                </Link>
                <Badge variant={health.variant} dot>
                  {health.label}
                </Badge>
              </span>
              {appliance.location ? (
                <span className={styles.meta}>{appliance.location}</span>
              ) : null}
              {appliance.openAlerts.length > 0 ? (
                <ul className={styles.alerts}>
                  {appliance.openAlerts.map((alert, index) => (
                    <li key={alert.id ?? index}>{alert.message}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
      {answer.truncated ? (
        <p className={styles.meta}>Showing the first {total} appliances.</p>
      ) : null}
      <MoreLink to={`${base(tool)}/alerts`} onNavigate={onNavigate}>
        Open alerts in Home Pulse
      </MoreLink>
    </>
  )
}

function Household({
  household,
  onNavigate,
}: {
  household: LedgerHousehold
  onNavigate: () => void
}) {
  const tool = 'family_treasury_ledger_summary'
  return (
    <>
      <Lead>
        Balances for{' '}
        <Link to={`${base(tool)}/h/${household.id}`} onClick={onNavigate}>
          {household.name}
        </Link>
        :
      </Lead>
      {household.accounts.length === 0 ? (
        <p className={styles.meta}>This household has no accounts yet.</p>
      ) : (
        <dl className={styles.ledger}>
          {household.accounts.map((account, index) => (
            <div key={account.id ?? index} className={styles.ledgerRow}>
              <dt>
                {account.name}
                {account.type ? (
                  <span className={styles.meta}> {sentenceCase(account.type)}</span>
                ) : null}
              </dt>
              <dd>{money(account.balance, account.currency)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className={styles.meta}>Bookkeeping only: no real money moves in Family Treasury.</p>
    </>
  )
}

function LedgerAnswer({ data, question, onNavigate, onChooseHousehold }: AnswerProps) {
  const answer = parseLedger(data)
  if (!answer) return <Unreadable tool="family_treasury_ledger_summary" />
  const { households } = answer
  const [only] = households
  if (!only) return <Lead>You don&apos;t belong to a household in Family Treasury yet.</Lead>
  if (households.length === 1) return <Household household={only} onNavigate={onNavigate} />
  const named = householdNamedIn(question, households)
  if (named) return <Household household={named} onNavigate={onNavigate} />
  return (
    <>
      <Lead>You belong to {households.length} households. Which one?</Lead>
      <div className={styles.choices} role="group" aria-label="Choose a household">
        {households.map((household) => (
          <Button
            key={household.id}
            size="sm"
            variant="secondary"
            onClick={() => onChooseHousehold({ id: household.id, name: household.name })}
          >
            {household.name}
          </Button>
        ))}
      </div>
    </>
  )
}

function Unreadable({ tool }: { tool: ToolName }) {
  return (
    <p className={styles.error} role="alert">
      {TOOL_PRODUCT[tool].title} answered in a way the assistant can&apos;t read.
    </p>
  )
}

const VIEWS: Record<ToolName, (props: AnswerProps) => ReactNode> = {
  waiting_on_list_followups: FollowUpsAnswer,
  ask_your_life_search: SearchAnswerView,
  home_pulse_appliance_status: AppliancesAnswer,
  family_treasury_ledger_summary: LedgerAnswer,
}

/** One tool's `structuredContent` as a readable answer, with links into the product's pages. */
export function Answer(props: AnswerProps) {
  const View = VIEWS[props.tool]
  return <View {...props} />
}
