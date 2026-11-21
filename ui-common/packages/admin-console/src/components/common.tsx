import { isApiError, type ApiError } from '@platform/api-client'
import {
  Avatar,
  Badge,
  Button,
  Callout,
  EmptyState,
  Illustration,
  PageHeader,
  PersonaBadge,
  Skeleton,
  Spinner,
  personas,
  type Persona,
} from '@platform/ui'
import { ModuleLink, useWorkspaceSession } from '@platform/workspace-kit'
import type { ReactNode } from 'react'
import { PERSONA_ORDER } from '../lib/catalogue'
import { errorMessage } from '../lib/api'
import { shortId } from '../lib/format'
import styles from './shared.module.css'

const isPersona = (role: string): role is Persona => (personas as readonly string[]).includes(role)

/** The roles a session holds, as persona badges (highest first). */
export function RoleBadges({
  roles,
  size = 'sm',
}: {
  roles: readonly string[]
  size?: 'sm' | 'md'
}) {
  const known = PERSONA_ORDER.filter((p) => roles.includes(p))
  const other = roles.filter((r) => !isPersona(r))
  return (
    <span className={styles.badges}>
      {known.map((p) => (
        <PersonaBadge key={p} persona={p} size={size} />
      ))}
      {other.map((r) => (
        <Badge key={r}>{r}</Badge>
      ))}
    </span>
  )
}

/** Shown in place of a screen the session may not open. */
export function Forbidden({ area, permission }: { area: string; permission: string }) {
  return (
    <EmptyState
      illustration={<Illustration name="locked" />}
      title={`${area} is not available to your role`}
      description={
        <>
          This screen needs the <code>{permission}</code> permission. Ask an owner if you need
          access.
        </>
      }
      action={
        <Button asChild variant="secondary">
          <ModuleLink to="/">Back to the overview</ModuleLink>
        </Button>
      }
    />
  )
}

export interface ScreenProps {
  title: ReactNode
  area: string
  description?: ReactNode
  /** The permission this screen needs. Children are not mounted (so nothing is fetched) without it. */
  permission: string
  actions?: ReactNode
  children: ReactNode
}

/** A page: header plus content, gated on one permission. */
export function Screen({ title, area, description, permission, actions, children }: ScreenProps) {
  const { can } = useWorkspaceSession()
  const allowed = can(permission)
  return (
    <div className={styles.stack}>
      <PageHeader
        eyebrow="Admin"
        title={title}
        {...(description ? { description } : {})}
        {...(allowed && actions ? { actions } : {})}
      />
      {allowed ? children : <Forbidden area={area} permission={permission} />}
    </div>
  )
}

/** A failed request, in plain words. 403 and network failures get their own treatment. */
export function ErrorPanel({
  error,
  subject,
  onRetry,
}: {
  error: ApiError | Error | null
  subject: string
  onRetry?: () => void
}) {
  const retry = onRetry ? (
    <Button size="sm" variant="secondary" onClick={onRetry}>
      Try again
    </Button>
  ) : undefined

  if (isApiError(error) && error.status === 403) {
    return (
      <EmptyState
        illustration={<Illustration name="locked" />}
        title="The platform did not allow this"
        description={`${errorMessage(error)}. Role changes can take up to a minute to reach your session.`}
        {...(retry ? { action: retry } : {})}
      />
    )
  }
  if (isApiError(error) && error.status === 0) {
    return (
      <Callout
        variant="danger"
        title="Can't reach the platform"
        {...(retry ? { action: retry } : {})}
      >
        Check your connection and that the gateway is running, then try again.
      </Callout>
    )
  }
  return (
    <Callout
      variant="danger"
      title={`Could not load ${subject}`}
      {...(retry ? { action: retry } : {})}
    >
      {errorMessage(error)}
    </Callout>
  )
}

export function LoadingBlock({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className={styles.loading} aria-busy="true">
      <Spinner label={label} />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height="2.5rem" width={i % 2 ? '85%' : '100%'} />
      ))}
    </div>
  )
}

/** Avatar with a name and an optional second line. */
export function Person({
  name,
  secondary,
  to,
  size = 'sm',
}: {
  name: string
  secondary?: ReactNode
  /** Module-relative link target. */
  to?: string
  size?: 'xs' | 'sm' | 'md'
}) {
  return (
    <span className={styles.person}>
      <Avatar name={name} size={size} decorative />
      <span className={styles.personText}>
        {to ? (
          <ModuleLink to={to} className={`${styles.personName} ${styles.link}`}>
            {name}
          </ModuleLink>
        ) : (
          <span className={styles.personName}>{name}</span>
        )}
        {secondary ? <span className={styles.subtle}>{secondary}</span> : null}
      </span>
    </span>
  )
}

export function Pagination({
  page,
  size,
  total,
  onPage,
  label,
}: {
  page: number
  size: number
  total: number
  onPage: (page: number) => void
  label: string
}) {
  const pages = Math.max(1, Math.ceil(total / size))
  const first = total === 0 ? 0 : page * size + 1
  const last = Math.min(total, (page + 1) * size)
  return (
    <nav className={styles.pager} aria-label={`${label} pages`}>
      <p className={styles.subtle} aria-live="polite">
        {total === 0 ? 'No results' : `Showing ${first} to ${last} of ${total}`}
        {pages > 1 ? `, page ${page + 1} of ${pages}` : ''}
      </p>
      {pages > 1 ? (
        <div className={styles.pagerButtons}>
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 0}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= pages - 1}
            onClick={() => onPage(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </nav>
  )
}

export function MonoId({ id }: { id: string }) {
  return (
    <code className={styles.mono} title={id}>
      {shortId(id)}
    </code>
  )
}
