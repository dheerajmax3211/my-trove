import { isApiError, useApiQuery } from '@platform/api-client'
import { Badge, Button, Skeleton, Sparkline } from '@platform/ui'
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

export type MeterState = 'ok' | 'near' | 'over'

export function meterState(used: number, limit: number): MeterState {
  if (used >= limit) return 'over'
  return used / limit >= 0.8 ? 'near' : 'ok'
}

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function resetLabel(now: Date): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    next,
  )
}

/** Requests used against the plan's monthly limit. Every failure shows a sentence and leaves the rest of the page alone. */
export function PlanUsage() {
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
        <Skeleton width="40%" height="2rem" />
        <Skeleton width="100%" height="0.5rem" />
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
    if (!plan) {
      body = (
        <p className={styles.note}>
          {number.format(used)} requests this month. This plan has no limit we can show.
        </p>
      )
    } else {
      const state = meterState(used, plan.perMonth)
      const percent = Math.min(100, Math.round((used / plan.perMonth) * 100))
      body = (
        <>
          <p className={styles.figure}>
            <span className={styles.used}>{number.format(used)}</span>
            <span className={styles.of}>of {number.format(plan.perMonth)} requests this month</span>
          </p>
          <div
            className={styles.track}
            role="meter"
            aria-label="Requests used this month"
            aria-valuemin={0}
            aria-valuemax={plan.perMonth}
            aria-valuenow={Math.min(used, plan.perMonth)}
            aria-valuetext={`${number.format(used)} of ${number.format(plan.perMonth)} requests, ${percent} percent`}
            data-state={state}
          >
            <span className={styles.fill} style={{ inlineSize: `${percent}%` }} />
          </div>
          <p className={styles.caption} data-state={state}>
            {state === 'over'
              ? `You are over the monthly limit. Requests are refused until it resets on ${resetLabel(runtime.now())}.`
              : state === 'near'
                ? `${percent}% used. Close to the monthly limit; it resets on ${resetLabel(runtime.now())}.`
                : `${percent}% used. Resets on ${resetLabel(runtime.now())}.`}
          </p>
          {series.length > 1 ? (
            <Sparkline
              data={series}
              width={240}
              height={36}
              tone={state === 'ok' ? 'accent' : state === 'near' ? 'brass' : 'danger'}
              label="Requests per day this month"
            />
          ) : null}
        </>
      )
    }
  }

  return (
    <section className={styles.card} aria-labelledby="plan-usage-title">
      <header className={styles.header}>
        <h2 id="plan-usage-title" className={styles.title}>
          Your plan
        </h2>
        <Badge variant="accent">{planName}</Badge>
      </header>
      {plan ? (
        <p className={styles.limits}>
          Up to {number.format(plan.perMinute)} requests a minute and {number.format(plan.perMonth)}{' '}
          a month.
        </p>
      ) : null}
      {body}
    </section>
  )
}
