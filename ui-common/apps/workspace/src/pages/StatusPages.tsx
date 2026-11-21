import { Button, IllustrationLocked, IllustrationSearch, PersonaBadge } from '@platform/ui'
import { useWorkspaceSession, type ProductModule } from '@platform/workspace-kit'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ModuleMark } from '../components/ModuleMark'
import { PERMISSION_LABELS, primaryPersona } from '../lib/personas'
import { usePageTitle } from '../lib/usePageTitle'
import { accessPermissions, canOpen, isProduct, moduleBase } from '../modules/registry'
import { useWorkspace } from '../workspace/context'
import styles from './StatusPages.module.css'

function StatusLayout({
  testId,
  art,
  title,
  description,
  children,
}: {
  testId: string
  art: ReactNode
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <section className={styles.status} data-testid={testId}>
      <div className={styles.art} aria-hidden="true">
        {art}
      </div>
      <div className={styles.copy}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
        {children}
        <div className={styles.actions}>
          <Button asChild>
            <Link to="/">Back to Today</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

/** Shown instead of a module (never half of it) when the signed-in role does not hold the permission it needs. */
export function ForbiddenPage({ module }: { module: ProductModule }) {
  const session = useWorkspaceSession()
  usePageTitle('No access')
  const persona = primaryPersona(session.roles)
  const needs = accessPermissions(module)
  const missing = needs.filter((permission) => !session.can(permission))
  return (
    <StatusLayout
      testId="forbidden"
      art={<IllustrationLocked size={260} />}
      title={`${module.title} is not part of your role`}
      description={
        needs.length > 1
          ? `Opening ${module.title} takes one of the permissions below, and your role has none of them.`
          : `Opening ${module.title} takes a permission your role does not have.`
      }
    >
      <dl className={styles.facts}>
        <div>
          <dt>You are signed in as</dt>
          <dd>
            <PersonaBadge persona={persona} />
            {session.email ? <span className={styles.muted}>{session.email}</span> : null}
          </dd>
        </div>
        <div>
          <dt>{missing.length > 1 ? 'Missing, any one of' : 'Missing'}</dt>
          <dd>
            <ul className={styles.perms}>
              {missing.map((permission) => (
                <li key={permission}>
                  <code>{permission}</code>
                  <span className={styles.muted}>{PERMISSION_LABELS[permission] ?? ''}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt>What to do</dt>
          <dd>Ask an admin or the owner of this workspace to change your role.</dd>
        </div>
      </dl>
    </StatusLayout>
  )
}

/** Unknown route or unknown product id. */
export function NotFoundPage({ what = 'page', id }: { what?: 'page' | 'product'; id?: string }) {
  const session = useWorkspaceSession()
  const { modules } = useWorkspace()
  usePageTitle('Not found')
  const options = modules.filter((module) => isProduct(module) && canOpen(module, session))
  return (
    <StatusLayout
      testId="not-found"
      art={<IllustrationSearch size={260} />}
      title={
        what === 'product'
          ? 'There is no product with that name'
          : 'There is no page at this address'
      }
      description={
        what === 'product' && id
          ? `We could not find a product called "${id}". These are the ones you can open.`
          : 'The link may be old or mistyped. Go back to Today, or open one of your products.'
      }
    >
      {options.length > 0 ? (
        <ul className={styles.productList} aria-label="Your products">
          {options.map((module) => (
            <li key={module.id}>
              <Link to={moduleBase(module)} className={styles.productLink}>
                <ModuleMark module={module} size={28} />
                {module.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </StatusLayout>
  )
}
