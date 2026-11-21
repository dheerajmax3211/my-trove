import { Avatar, Badge, EmptyState, Illustration, PageHeader } from '@platform/ui'
import { ModuleLink, useWorkspaceSession } from '@platform/workspace-kit'
import { ErrorPanel, LoadingBlock, RoleBadges } from '../components/common'
import shared from '../components/shared.module.css'
import { UsageStats } from '../components/UsageStats'
import { PERMISSIONS } from '../lib/catalogue'
import { usePlatformQuery } from '../lib/api'
import { useUsageWindow } from '../lib/range'
import { SECTIONS } from '../lib/sections'
import type { UsageSummary } from '../lib/types'
import { YourUsage } from './YourUsage'
import styles from './Overview.module.css'

export function OverviewScreen() {
  const session = useWorkspaceSession()
  const win = useUsageWindow('24h', false)
  const links = SECTIONS.filter((s) => s.to !== '/' && (!s.permission || session.can(s.permission)))
  const name = session.displayName ?? session.email ?? 'Signed-in user'
  const canReadAll = session.can(PERMISSIONS.usageReadAll)
  const canReadSelf = session.can(PERMISSIONS.usageReadSelf)

  return (
    <div className={shared.stack}>
      <PageHeader
        eyebrow="Admin"
        title="Admin console"
        description="Run the platform: people and roles, usage, the audit log and feature flags. You see the parts your role allows."
      />

      <section className={styles.identity} aria-label="You">
        <Avatar name={name} size="lg" decorative />
        <div className={styles.who}>
          <p className={styles.name}>{name}</p>
          {session.displayName && session.email ? (
            <p className={shared.muted}>{session.email}</p>
          ) : null}
          <div className={styles.badges}>
            {session.roles.length > 0 ? <RoleBadges roles={session.roles} size="md" /> : null}
            <Badge>{session.plan} plan</Badge>
            {session.isDemo ? <Badge variant="info">Demo data</Badge> : null}
          </div>
        </div>
      </section>

      {canReadAll ? <Headline win={win} /> : null}

      {links.length > 0 ? (
        <nav aria-label="Admin screens">
          <h2 className={shared.sectionTitle}>Where to next</h2>
          <ul className={styles.links}>
            {links.map((s) => (
              <li key={s.to}>
                <ModuleLink to={s.to} className={styles.link}>
                  {s.icon ? <s.icon size={20} /> : null}
                  <span className={styles.linkText}>
                    <span className={styles.linkLabel}>{s.label}</span>
                    <span className={shared.subtle}>{s.description}</span>
                  </span>
                </ModuleLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <EmptyState
          illustration={<Illustration name="key" />}
          title="There is nothing to administer with your role"
          description="The admin console is for the people who run the platform. Owners and admins manage users, roles and flags; auditors read usage and the audit log. Your own usage is below, and an owner can change your role if you need more."
        />
      )}

      {!canReadAll && canReadSelf ? (
        <YourUsage from={win.from} to={win.to} rangeLabel={win.range.long} />
      ) : null}
    </div>
  )
}

function Headline({ win }: { win: ReturnType<typeof useUsageWindow> }) {
  const summary = usePlatformQuery<UsageSummary>('/v1/usage/summary', {
    from: win.from,
    to: win.to,
  })
  const previous = usePlatformQuery<UsageSummary>('/v1/usage/summary', {
    from: win.previousFrom,
    to: win.previousTo,
  })
  return (
    <section className={shared.panel} aria-labelledby="overview-usage">
      <div className={shared.panelHead}>
        <h2 id="overview-usage" className={shared.panelTitle}>
          The last 24 hours
        </h2>
        <ModuleLink to="/usage" className={shared.link}>
          Open usage
        </ModuleLink>
      </div>
      <div className={shared.panelBody}>
        {summary.isPending ? (
          <LoadingBlock label="Loading usage" rows={1} />
        ) : summary.isError ? (
          <ErrorPanel
            error={summary.error}
            subject="usage"
            onRetry={() => void summary.refetch()}
          />
        ) : (
          <UsageStats
            summary={summary.data}
            previous={previous.data}
            against="vs. the 24 hours before"
          />
        )}
      </div>
    </section>
  )
}
