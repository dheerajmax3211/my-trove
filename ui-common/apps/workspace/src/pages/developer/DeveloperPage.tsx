import { Badge, BentoCard, BentoGrid, Callout, CodeIcon, KeyIcon, PageHeader } from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { DEVELOPER_PERMISSIONS, canOpenDeveloper } from '../../lib/developer'
import { PERMISSION_LABELS } from '../../lib/personas'
import { usePageTitle } from '../../lib/usePageTitle'
import { PlanUsage } from '../home/PlanUsage'
import { ForbiddenFor } from '../StatusPages'
import styles from './DeveloperPage.module.css'

/**
 * The developer area. What exists today: your own usage on the platform, and the developer permissions your role holds.
 * API keys and developer apps are Phase 3 and are described, not offered: there is no control here that does nothing.
 */
export function DeveloperPage() {
  const session = useWorkspaceSession()
  usePageTitle('Developer')
  if (!canOpenDeveloper(session)) {
    return <ForbiddenFor title="Developer" needs={DEVELOPER_PERMISSIONS} />
  }

  const held = DEVELOPER_PERMISSIONS.filter((permission) => session.can(permission))

  return (
    <>
      <PageHeader
        eyebrow="Build on My-Trove"
        title="Developer"
        description="Your usage on the platform, the developer permissions your role holds, and what the developer tools will do once they are built."
      />

      <BentoGrid>
        <PlanUsage span={6} />

        <BentoCard span={6} title="What your role lets you do" icon={<CodeIcon size={18} />}>
          <ul aria-label="Developer permissions you hold" className={styles.list}>
            {held.map((permission) => (
              <li key={permission}>
                {PERMISSION_LABELS[permission] ?? permission} <code>{permission}</code>
              </li>
            ))}
          </ul>
        </BentoCard>

        <BentoCard span={6} title="API keys" icon={<KeyIcon size={18} />}>
          <Badge variant="info">Phase 3, not built yet</Badge>
          <p>
            Keys will let your own code call My-Trove products as you, with only the scopes you
            pick. You will be able to see when each key was last used and revoke it at any time.
          </p>
          <p>Until then there is no key to create here, and nothing is issued.</p>
        </BentoCard>

        <BentoCard span={6} title="Developer apps and webhooks" icon={<CodeIcon size={18} />}>
          <Badge variant="info">Phase 3, not built yet</Badge>
          <p>
            An app will get its own client, its redirect addresses and its scopes, and its own usage
            and logs. Webhooks will send events from your data to an address you choose.
          </p>
        </BentoCard>
      </BentoGrid>

      <Callout variant="note" title="Plans, not controls">
        Nothing on this page changes data. Your requests are counted against your plan the same way
        as any other product use.
      </Callout>
    </>
  )
}
