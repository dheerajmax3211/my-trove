import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  Illustration,
  Input,
  type BadgeVariant,
  type DataTableColumn,
} from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { keepPreviousData } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ErrorPanel, Pagination, Screen } from '../components/common'
import shared from '../components/shared.module.css'
import { auditDetail, auditTitle } from '../lib/audit'
import { PERMISSIONS } from '../lib/catalogue'
import { useAuthQuery, useNames } from '../lib/api'
import { formatDateTime, formatRelative, isUuid } from '../lib/format'
import type { AuditEntry, Page } from '../lib/types'

export const AUDIT_PAGE_SIZE = 20

const ACTION_VARIANT: Record<string, BadgeVariant> = {
  ROLE_GRANTED: 'accent',
  ROLE_REVOKED: 'warning',
  USER_SUSPENDED: 'danger',
  USER_RESTORED: 'success',
  PLAN_CHANGED: 'info',
}

export function AuditScreen() {
  return (
    <Screen
      title="Audit log"
      area="The audit log"
      permission={PERMISSIONS.auditRead}
      description="Every role grant, suspension and plan change, newest first. Entries cannot be edited or deleted."
    >
      <AuditLog />
    </Screen>
  )
}

function AuditLog() {
  const [params, setParams] = useSearchParams()
  const target = params.get('target') ?? ''
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)
  const validTarget = isUuid(target) ? target : ''
  const [draft, setDraft] = useState(target)
  const [draftError, setDraftError] = useState<string | null>(null)

  const update = (changes: Record<string, string | null>) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      return next
    })

  const audit = useAuthQuery<Page<AuditEntry>>(
    '/v1/admin/audit',
    { ...(validTarget ? { targetId: validTarget } : {}), page, size: AUDIT_PAGE_SIZE },
    { placeholderData: keepPreviousData },
  )
  const entries = audit.data?.items ?? []
  const names = useNames([
    ...entries.flatMap((e) => [e.actorId, e.targetId]),
    validTarget || undefined,
  ])

  const columns: DataTableColumn<AuditEntry>[] = [
    {
      id: 'when',
      header: 'When',
      cell: (e) => (
        <time dateTime={e.at} title={formatDateTime(e.at)}>
          {formatRelative(e.at)}
        </time>
      ),
    },
    {
      id: 'actor',
      header: 'Who',
      cell: (e) =>
        e.actorId ? (
          <ModuleLink to={`/users/${e.actorId}`} className={shared.link}>
            {names.nameOf(e.actorId)}
          </ModuleLink>
        ) : (
          <span className={shared.muted}>System</span>
        ),
    },
    {
      id: 'action',
      header: 'What',
      cell: (e) => (
        <span className={shared.stackTight}>
          <Badge variant={ACTION_VARIANT[e.action] ?? 'neutral'}>{auditTitle(e)}</Badge>
          {auditDetail(e) ? <span className={shared.subtle}>{auditDetail(e)}</span> : null}
        </span>
      ),
    },
    {
      id: 'target',
      header: 'Whom',
      cell: (e) =>
        e.targetId ? (
          <ModuleLink to={`/users/${e.targetId}`} className={shared.link}>
            {names.nameOf(e.targetId)}
          </ModuleLink>
        ) : (
          <span className={shared.muted}>None</span>
        ),
    },
  ]

  const apply = () => {
    const value = draft.trim()
    if (!value) {
      setDraftError(null)
      update({ target: null, page: null })
      return
    }
    if (!isUuid(value)) {
      setDraftError('Enter a full user id, for example 0190d2a4-7a3e-7c1b-9f2e-3a4d5e6f7a8b.')
      return
    }
    setDraftError(null)
    update({ target: value, page: null })
  }

  const clear = () => {
    setDraft('')
    setDraftError(null)
    update({ target: null, page: null })
  }

  return (
    <div className={shared.stackTight}>
      <form
        className={shared.toolbar}
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          apply()
        }}
      >
        <Field
          label="Filter by user id"
          className={shared.grow}
          description="Shows changes made to one user. Open a user and choose Audit trail to fill this in."
          error={draftError}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
          />
        </Field>
        <Button type="submit" variant="secondary">
          Apply filter
        </Button>
        {validTarget ? (
          <Button variant="ghost" onClick={clear}>
            Clear filter
          </Button>
        ) : null}
      </form>

      {validTarget ? (
        <p className={shared.muted} role="status">
          Showing changes to <strong>{names.nameOf(validTarget)}</strong>.
        </p>
      ) : null}

      {audit.isError && !audit.data ? (
        <ErrorPanel
          error={audit.error}
          subject="the audit log"
          onRetry={() => void audit.refetch()}
        />
      ) : (
        <>
          <DataTable
            caption="Audit log"
            columns={columns}
            data={entries}
            getRowId={(e) => e.id}
            loading={audit.isPending}
            emptyState={
              <EmptyState
                illustration={<Illustration name={validTarget ? 'search' : 'empty'} />}
                headingAs="h3"
                title={
                  validTarget
                    ? 'No recorded changes for this user'
                    : 'Nothing has been recorded yet'
                }
                description={
                  validTarget
                    ? 'Role grants, suspensions and plan changes for them would appear here.'
                    : 'Role grants, suspensions, restorations and plan changes are written here as they happen.'
                }
                {...(validTarget
                  ? {
                      action: (
                        <Button variant="secondary" onClick={clear}>
                          Clear filter
                        </Button>
                      ),
                    }
                  : {})}
              />
            }
          />
          {audit.data ? (
            <Pagination
              label="Audit log"
              page={audit.data.page}
              size={audit.data.size}
              total={audit.data.total}
              onPage={(p) => update({ page: p > 0 ? String(p) : null })}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
