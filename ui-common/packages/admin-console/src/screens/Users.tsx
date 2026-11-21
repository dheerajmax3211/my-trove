import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  Illustration,
  Input,
  SearchIcon,
  VisuallyHidden,
  type DataTableColumn,
} from '@platform/ui'
import { keepPreviousData } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ModuleLink } from '@platform/workspace-kit'
import { ErrorPanel, Pagination, Person, RoleBadges, Screen } from '../components/common'
import shared from '../components/shared.module.css'
import { PERMISSIONS } from '../lib/catalogue'
import { useAuthQuery } from '../lib/api'
import type { AdminUser, Page } from '../lib/types'

export const USERS_PAGE_SIZE = 20

export const userLabel = (u: Pick<AdminUser, 'displayName' | 'email' | 'id'>): string =>
  u.displayName?.trim() || u.email?.trim() || `User ${u.id.slice(0, 8)}`

export function UsersScreen() {
  return (
    <Screen
      title="Users"
      area="Users"
      permission={PERMISSIONS.usersRead}
      description="Everyone who has signed in: their roles, plan and whether they can still get in."
    >
      <UsersList />
    </Screen>
  )
}

function UsersList() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)
  const [draft, setDraft] = useState(q)

  // Search as you type, after a short pause; the URL is the source of truth so back/forward and links work.
  useEffect(() => {
    if (draft.trim() === q) return
    const timer = setTimeout(() => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (draft.trim()) next.set('q', draft.trim())
          else next.delete('q')
          next.delete('page')
          return next
        },
        { replace: true },
      )
    }, 250)
    return () => clearTimeout(timer)
  }, [draft, q, setParams])

  const setPage = (next: number) =>
    setParams((current) => {
      const n = new URLSearchParams(current)
      if (next > 0) n.set('page', String(next))
      else n.delete('page')
      return n
    })

  const users = useAuthQuery<Page<AdminUser>>(
    '/v1/admin/users',
    { ...(q ? { q } : {}), page, size: USERS_PAGE_SIZE },
    { placeholderData: keepPreviousData },
  )

  const columns: DataTableColumn<AdminUser>[] = [
    {
      id: 'user',
      header: 'User',
      cell: (u) => (
        <Person
          name={userLabel(u)}
          to={`/users/${u.id}`}
          secondary={u.displayName && u.email ? u.email : undefined}
        />
      ),
    },
    { id: 'roles', header: 'Roles', cell: (u) => <RoleBadges roles={u.roles} /> },
    { id: 'plan', header: 'Plan', cell: (u) => <Badge>{u.plan}</Badge> },
    {
      id: 'status',
      header: 'Status',
      cell: (u) =>
        u.suspended ? (
          <Badge variant="danger" dot>
            Suspended
          </Badge>
        ) : (
          <Badge variant="success" dot>
            Active
          </Badge>
        ),
    },
    {
      id: 'manage',
      header: <VisuallyHidden>Manage</VisuallyHidden>,
      headerLabel: 'Manage',
      align: 'end',
      cell: (u) => (
        <Button asChild size="sm" variant="secondary">
          <ModuleLink to={`/users/${u.id}`} aria-label={`Manage ${userLabel(u)}`}>
            Manage
          </ModuleLink>
        </Button>
      ),
    },
  ]

  return (
    <div className={shared.stackTight}>
      <form
        className={shared.toolbar}
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          setDraft((d) => d.trim())
        }}
      >
        <Field label="Search users" className={shared.grow} description="Matches name or email.">
          <Input
            type="search"
            value={draft}
            placeholder="ada@example.com"
            onChange={(event) => setDraft(event.target.value)}
          />
        </Field>
        {q ? (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft('')
              setParams({}, { replace: true })
            }}
          >
            Clear search
          </Button>
        ) : null}
      </form>

      {users.isError && !users.data ? (
        <ErrorPanel error={users.error} subject="users" onRetry={() => void users.refetch()} />
      ) : (
        <>
          <DataTable
            caption="Users"
            columns={columns}
            data={users.data?.items ?? []}
            getRowId={(u) => u.id}
            loading={users.isPending}
            emptyState={
              q ? (
                <EmptyState
                  illustration={<Illustration name="search" />}
                  headingAs="h3"
                  title={`No one matches "${q}"`}
                  description="Search covers names and email addresses, as plain text."
                  action={
                    <Button
                      variant="secondary"
                      leftIcon={<SearchIcon size={16} />}
                      onClick={() => {
                        setDraft('')
                        setParams({}, { replace: true })
                      }}
                    >
                      Clear search
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  illustration={<Illustration name="empty" />}
                  headingAs="h3"
                  title="No users yet"
                  description="People appear here after they sign in for the first time."
                />
              )
            }
          />
          {users.data ? (
            <Pagination
              label="Users"
              page={users.data.page}
              size={users.data.size}
              total={users.data.total}
              onPage={setPage}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
