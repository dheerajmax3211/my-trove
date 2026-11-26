import { isApiError, useApiQuery } from '@platform/api-client'
import { Badge, BentoCard, BigStat, Button, CoinsIcon, Skeleton, Sparkline } from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { planInfo } from '../../lib/personas'
import { useWorkspace } from '../../workspace/context'
import styles from './PlanUsage.module.css'

/** What `GET /platform/v1/usage/me` returns (the parts the meter uses). */
export interface UsageMe {
  totalRequests: number
  series?: { ts: string; requests: number; errors?: number }[]
}

const number = new Intl.NumberFormat('en')

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/**
 * The plan and this month's activity: the page's one black card. Plans limit apps and API keys; a person
 * using the workspace is never cut off by them (gateway ADR 0007), so the figure is activity, not a quota.
 * Every failure shows a sentence and leaves the rest of the page alone.
 */
export function PlanUsage({ span = 5 }: { span?: number }) {
  const session = useWorkspaceSession()
  const { runtime } = useWorkspace()
  const plan = planInfo(session.plan)
  const canReadSelf = session.can('usage:read:self')
  const from = useMemo(() => startOfMonthUtc(runtime.now()).toISOString(), [runtime])
  const usage = useApiQuery<UsageMe>('/platform/v1/usage/me', {
    query: { from },
    enabled: canReadSelf,
  })

  const planName = plan?.name ?? session.plan
  let body: ReactNode

  if (!canReadSelf) {
    body = (
      <p className={styles.note}>
        {session.can('usage:read:all') ? (
          <>
            Your role does not include personal usage. Platform-wide numbers are in{' '}
            <Link to="/app/admin/usage">Admin</Link>.
          </>
        ) : (
          'Your role does not include usage numbers.'
        )}
      </p>
    )
  } else if (usage.isPending) {
    body = (
      <div
        aria-busy="true"
        role="status"
        aria-label="Loading your usage"
        className={styles.loading}
      >
        <Skeleton width="55%" height="3.5rem" />
        <Skeleton width="100%" height="0.75rem" />
        <Skeleton width="70%" height="1rem" />
      </div>
    )
  } else if (usage.isError) {
    const status = isApiError(usage.error) ? usage.error.status : 0
    body =
      status === 403 ? (
        <p className={styles.note}>Your role does not include usage numbers.</p>
      ) : status === 404 ? (
        <p className={styles.note}>
          Usage is not being counted for this workspace yet, so there is nothing to show.
        </p>
      ) : (
        <div className={styles.failed}>
          <p className={styles.note}>
            We could not load your usage. The rest of your workspace is fine.
          </p>
          <Button size="sm" variant="secondary" onClick={() => void usage.refetch()}>
            Try again
          </Button>
        </div>
      )
  } else {
    const used = usage.data.totalRequests
    const series = (usage.data.series ?? []).map((point) => point.requests)
    body = (
      <>
        <div className={styles.figure}>
          <BigStat value={used} locale="en" caption="requests across your products this month" />
        </div>
        <p className={styles.caption}>Using your workspace is never limited by your plan.</p>
        {series.length > 1 ? (
          <Sparkline
            className={styles.spark}
            data={series}
            width={320}
            height={56}
            animate
            tone="accent"
            label="Requests per day this month"
          />
        ) : null}
      </>
    )
  }

  return (
    <BentoCard
      span={span}
      tone="dark"
      title="Your plan"
      icon={<CoinsIcon size={18} />}
      actions={<Badge variant="accent">{planName}</Badge>}
    >
      {plan ? (
        <p className={styles.limits}>
          For apps and API keys: up to {number.format(plan.perMinute)} requests a minute and{' '}
          {number.format(plan.perMonth)} a month.
        </p>
      ) : null}
      {body}
    </BentoCard>
  )
}
