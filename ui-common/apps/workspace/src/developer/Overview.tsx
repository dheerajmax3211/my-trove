import { isApiError } from '@platform/api-client'
import { Badge, BentoCard, BentoGrid, Callout, CodeIcon, KeyIcon, LinkIcon } from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { Link } from 'react-router-dom'
import { PlanUsage } from '../pages/home/PlanUsage'
import { PERMISSION_LABELS, planInfo } from '../lib/personas'
import { limitsFor, capacity } from './limits'
import { deliveryLabel, keyState, when } from './format'
import { useDeliveriesOf, useDeveloperApps, useKeysOfApps, useWebhooksOfApps } from './hooks'
import { CapacityBar } from './CapacityBar'
import styles from './Developer.module.css'

const LATEST = 5

/** The first screen of the developer console: usage, what is in use against the plan, and what just happened. */
export function Overview({ held }: { held: readonly string[] }) {
  const session = useWorkspaceSession()
  const apps = useDeveloperApps()
  const list = apps.data ?? []
  const keys = useKeysOfApps(list)
  const webhooks = useWebhooksOfApps(list)
  const deliveries = useDeliveriesOf(webhooks.webhooks)
  const limits = limitsFor(session.plan)
  const plan = planInfo(session.plan)
  const now = new Date()

  const liveApps = list.filter((app) => !app.revokedAt)
  const liveKeys = keys.keys.filter((key) => keyState(key, now) === 'Active')
  const liveHooks = webhooks.webhooks.filter((hook) => hook.disabledAt === null)
  const keyCap = capacity(liveKeys.length, limits.keys)
  const hookCap = capacity(liveHooks.length, limits.webhooks)
  const latest = deliveries.deliveries
    .slice()
    .sort((a, b) => b.delivery.createdAt.localeCompare(a.delivery.createdAt))
    .slice(0, LATEST)

  return (
    <BentoGrid>
      <PlanUsage span={6} />

      <BentoCard span={3} title="API keys" icon={<KeyIcon size={18} />}>
        <CapacityBar label="Active keys" capacity={keyCap} />
        <p className={styles.muted}>
          Up to {limits.keys} on the {plan?.name ?? session.plan} plan. Revoking one frees its slot.
        </p>
        <Link to="/developer/keys">Manage keys</Link>
      </BentoCard>

      <BentoCard span={3} title="Webhooks" icon={<LinkIcon size={18} />}>
        <CapacityBar label="Active endpoints" capacity={hookCap} />
        <p className={styles.muted}>
          Up to {limits.webhooks} on the {plan?.name ?? session.plan} plan.
        </p>
        <Link to="/developer/webhooks">Manage webhooks</Link>
      </BentoCard>

      <BentoCard span={6} title="Apps" icon={<CodeIcon size={18} />}>
        {apps.isError ? (
          <Callout variant="danger" title="We could not load your apps">
            {isApiError(apps.error) ? apps.error.title : 'Check your connection and try again.'}
          </Callout>
        ) : apps.isPending ? (
          <p className={styles.muted}>Loading your apps.</p>
        ) : (
          <>
            <p className={styles.muted}>
              {liveApps.length === 0
                ? 'You have no apps yet. An app gets a client, redirect addresses and keys.'
                : `${liveApps.length} active ${liveApps.length === 1 ? 'app' : 'apps'}.`}
            </p>
            <ul className={styles.list}>
              {liveApps.slice(0, 3).map((app) => (
                <li key={app.id} className={styles.listItem}>
                  <Link to={`/developer/apps/${app.id}`}>{app.name}</Link>
                  <span className={styles.mono}>{app.clientId}</span>
                </li>
              ))}
            </ul>
            <div className={styles.row}>
              <Link to="/developer/apps">All apps and registration</Link>
            </div>
          </>
        )}
      </BentoCard>

      <BentoCard span={6} title="Latest deliveries" icon={<LinkIcon size={18} />}>
        {latest.length === 0 ? (
          <p className={styles.muted}>
            No webhook deliveries yet. They appear here once an endpoint has an event to send.
          </p>
        ) : (
          <ul className={styles.list} aria-label="Latest deliveries">
            {latest.map(({ delivery, webhook }) => (
              <li key={delivery.id} className={styles.listItem}>
                <span>
                  <code>{delivery.eventType}</code> to{' '}
                  <span className={styles.mono}>{webhook.url}</span>
                </span>
                <span className={styles.row}>
                  <Badge variant={delivery.status === 'DELIVERED' ? 'success' : 'warning'}>
                    {deliveryLabel(delivery.status)}
                  </Badge>
                  <span className={styles.muted}>{when(delivery.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </BentoCard>

      <BentoCard span={6} title="What your role lets you do" icon={<CodeIcon size={18} />}>
        <ul aria-label="Developer permissions you hold" className={styles.list}>
          {held.map((permission) => (
            <li key={permission}>
              {PERMISSION_LABELS[permission] ?? permission} <code>{permission}</code>
            </li>
          ))}
        </ul>
      </BentoCard>
    </BentoGrid>
  )
}
