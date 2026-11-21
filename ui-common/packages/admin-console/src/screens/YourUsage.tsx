import { EmptyState, Illustration } from '@platform/ui'
import { ErrorPanel, LoadingBlock } from '../components/common'
import shared from '../components/shared.module.css'
import { UsageStats } from '../components/UsageStats'
import { usePlatformQuery } from '../lib/api'
import type { UsageSummary } from '../lib/types'

/** What the signed-in person themselves sent through the gateway (`GET /v1/usage/me`). Open to everyone with usage:read:self. */
export function YourUsage({
  from,
  to,
  rangeLabel,
}: {
  from: string
  to: string
  rangeLabel: string
}) {
  const mine = usePlatformQuery<UsageSummary>('/v1/usage/me', { from, to })
  return (
    <section className={shared.panel} aria-labelledby="your-usage">
      <div className={shared.panelHead}>
        <h2 id="your-usage" className={shared.panelTitle}>
          Your usage
        </h2>
        <span className={shared.panelHint}>Only your own requests, {rangeLabel}</span>
      </div>
      <div className={shared.panelBody}>
        {mine.isPending ? (
          <LoadingBlock label="Loading your usage" rows={1} />
        ) : mine.isError ? (
          <ErrorPanel error={mine.error} subject="your usage" onRetry={() => void mine.refetch()} />
        ) : mine.data.totalRequests === 0 ? (
          <EmptyState
            illustration={<Illustration name="allClear" />}
            headingAs="h3"
            title="You have not made a request in this range"
            description="Open one of the products and your requests will be counted here."
          />
        ) : (
          <UsageStats summary={mine.data} showActiveUsers={false} />
        )}
      </div>
    </section>
  )
}
