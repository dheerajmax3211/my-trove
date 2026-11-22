import { Badge, Callout, PageHeader } from '@platform/ui'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { NavLink, Route, Routes } from 'react-router-dom'
import { canOpenDeveloper, DEVELOPER_PERMISSIONS } from '../lib/developer'
import { usePageTitle } from '../lib/usePageTitle'
import { useWorkspace } from '../workspace/context'
import { ForbiddenFor, NotFoundPage } from '../pages/StatusPages'
import { ApiDocs } from './ApiDocs'
import { AppDetail } from './AppDetail'
import { Apps } from './Apps'
import { Keys } from './Keys'
import { Overview } from './Overview'
import { Playground } from './Playground'
import styles from './Developer.module.css'
import { Webhooks } from './Webhooks'

const SECTIONS = [
  { to: '/developer', label: 'Overview', end: true },
  { to: '/developer/apps', label: 'Apps' },
  { to: '/developer/keys', label: 'API keys' },
  { to: '/developer/webhooks', label: 'Webhooks' },
  { to: '/developer/docs', label: 'API docs' },
  { to: '/developer/playground', label: 'Playground' },
] as const

/**
 * The developer console. Opens for holders of `apps:manage` (the owner and developers). Every screen talks to the
 * developer platform through the workspace's own client, so demo mode answers from memory and live mode goes through
 * the gateway with the signed-in user's token.
 */
export function DeveloperArea() {
  const session = useWorkspaceSession()
  const { runtime } = useWorkspace()
  usePageTitle('Developer')

  if (!canOpenDeveloper(session)) {
    return <ForbiddenFor title="Developer" needs={['apps:manage']} />
  }
  const held = DEVELOPER_PERMISSIONS.filter((permission) => session.can(permission))

  return (
    <>
      <PageHeader
        eyebrow="Build on My-Trove"
        title="Developer"
        description="Your apps, the keys they use, the webhooks they send, and the API they call."
        actions={runtime.mode === 'demo' ? <Badge variant="warning">Demo data</Badge> : undefined}
      />
      {runtime.mode === 'demo' ? (
        <Callout variant="note" title="Demo mode">
          Nothing here reaches the platform. Apps, keys and webhooks live in this browser tab until
          you reload, and the secrets are sample values.
        </Callout>
      ) : null}

      <nav aria-label="Developer sections" className={styles.subnav}>
        {SECTIONS.map((section) => (
          <NavLink key={section.to} to={section.to} end={'end' in section ? section.end : false}>
            {section.label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route index element={<Overview held={held} />} />
        <Route path="apps" element={<Apps />} />
        <Route path="apps/:id" element={<AppDetail />} />
        <Route path="keys" element={<Keys />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="docs" element={<ApiDocs />} />
        <Route path="playground" element={<Playground />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}
