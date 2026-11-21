import { useApiClient, apiQueryKey, type ApiError } from '@platform/api-client'
import {
  Badge,
  Button,
  Callout,
  Dialog,
  DialogClose,
  EmptyState,
  Field,
  Illustration,
  KeyValueList,
  PageHeader,
  PersonaBadge,
  Select,
  Timeline,
  personas,
  type Persona,
} from '@platform/ui'
import { ModuleLink, useWorkspaceSession } from '@platform/workspace-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorPanel, Forbidden, LoadingBlock, RoleBadges } from '../components/common'
import shared from '../components/shared.module.css'
import { auditDetail, auditTitle, auditTone } from '../lib/audit'
import { PERMISSIONS, PLAN_NAMES, PRIVILEGED_ROLES } from '../lib/catalogue'
import { errorMessage, useAuthQuery, useNames } from '../lib/api'
import { formatDateTime } from '../lib/format'
import type { AdminUser, AuditEntry, Page, RoleView } from '../lib/types'
import { userLabel } from './Users'
import styles from './UserDetail.module.css'

type UserAction =
  | { kind: 'grant'; role: string }
  | { kind: 'revoke'; role: string }
  | { kind: 'suspend' }
  | { kind: 'restore' }
  | { kind: 'plan'; plan: string }

function requestFor(
  id: string,
  action: UserAction,
): { path: string; method: 'PUT' | 'DELETE' | 'POST' } {
  const base = `/v1/admin/users/${encodeURIComponent(id)}`
  switch (action.kind) {
    case 'grant':
      return { path: `${base}/roles/${encodeURIComponent(action.role)}`, method: 'PUT' }
    case 'revoke':
      return { path: `${base}/roles/${encodeURIComponent(action.role)}`, method: 'DELETE' }
    case 'suspend':
      return { path: `${base}/suspend`, method: 'POST' }
    case 'restore':
      return { path: `${base}/restore`, method: 'POST' }
    case 'plan':
      return { path: `${base}/plan/${encodeURIComponent(action.plan)}`, method: 'PUT' }
  }
}

function successMessage(action: UserAction, name: string): string {
  switch (action.kind) {
    case 'grant':
      return `Granted ${action.role} to ${name}.`
    case 'revoke':
      return `Revoked ${action.role} from ${name}.`
    case 'suspend':
      return `Suspended ${name}.`
    case 'restore':
      return `Restored ${name}.`
    case 'plan':
      return `Moved ${name} to the ${action.plan} plan.`
  }
}

export function UserDetailScreen() {
  const { id = '' } = useParams()
  const { can } = useWorkspaceSession()
  if (!can(PERMISSIONS.usersRead)) {
    return (
      <div className={shared.stack}>
        <PageHeader eyebrow="Admin" title="User" />
        <Forbidden area="Users" permission={PERMISSIONS.usersRead} />
      </div>
    )
  }
  return <UserDetail id={id} />
}

function UserDetail({ id }: { id: string }) {
  const client = useApiClient()
  const queryClient = useQueryClient()
  const session = useWorkspaceSession()
  const userPath = `/v1/admin/users/${encodeURIComponent(id)}`

  const user = useAuthQuery<AdminUser>(userPath)
  const roles = useAuthQuery<RoleView[]>('/v1/admin/roles')

  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [plan, setPlan] = useState<string | null>(null)

  const act = useMutation<AdminUser, ApiError, UserAction>({
    mutationFn: (action) => {
      const { path, method } = requestFor(id, action)
      return client.request<AdminUser>(path, { method })
    },
    onMutate: (action) => {
      setFailure(null)
      setNotice(null)
      setPendingKey(`${action.kind}:${'role' in action ? action.role : ''}`)
    },
    onSuccess: async (updated, action) => {
      queryClient.setQueryData(apiQueryKey(userPath), updated)
      setNotice(successMessage(action, userLabel(updated)))
      if (action.kind === 'plan') setPlan(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/v1/admin/users'] }),
        queryClient.invalidateQueries({ queryKey: ['/v1/admin/audit'] }),
      ])
    },
    onError: (error, action) => {
      const titles: Record<UserAction['kind'], string> = {
        grant: 'Could not grant the role',
        revoke: 'Could not revoke the role',
        suspend: 'Could not suspend this user',
        restore: 'Could not restore this user',
        plan: 'Could not change the plan',
      }
      setFailure({ title: titles[action.kind], message: errorMessage(error) })
    },
    onSettled: () => setPendingKey(null),
  })

  if (user.isPending) return <LoadingBlock label="Loading user" />
  if (user.isError) {
    const notFound = user.error.status === 404
    return (
      <div className={shared.stack}>
        <PageHeader
          eyebrow="Admin"
          title="User"
          actions={
            <Button asChild variant="secondary">
              <ModuleLink to="/users">All users</ModuleLink>
            </Button>
          }
        />
        {notFound ? (
          <EmptyState
            illustration={<Illustration name="search" />}
            title="That user does not exist"
            description={errorMessage(user.error)}
          />
        ) : (
          <ErrorPanel error={user.error} subject="this user" onRetry={() => void user.refetch()} />
        )}
      </div>
    )
  }

  const u = user.data
  const name = userLabel(u)
  const canAssign = session.can(PERMISSIONS.rolesAssign)
  const canPrivileged = session.can(PERMISSIONS.rolesAssignPrivileged)
  const canSuspend = session.can(PERMISSIONS.usersWrite)
  const canPlan = session.can(PERMISSIONS.plansManage)
  const isSelf = session.email !== null && u.email !== null && session.email === u.email
  const chosenPlan = plan ?? u.plan

  const roleList: RoleView[] =
    roles.data ?? u.roles.map((role) => ({ name: role, description: '', permissions: [] }))

  return (
    <div className={shared.stack}>
      <PageHeader
        eyebrow="Admin"
        title={name}
        description={u.displayName && u.email ? u.email : undefined}
        actions={
          <>
            <Button asChild variant="secondary">
              <ModuleLink to="/users">All users</ModuleLink>
            </Button>
            {session.can(PERMISSIONS.auditRead) ? (
              <Button asChild variant="secondary">
                <ModuleLink to={`/audit?target=${u.id}`}>Audit trail</ModuleLink>
              </Button>
            ) : null}
          </>
        }
      />

      <div role="status" aria-live="polite" className={styles.live}>
        {notice ? <Callout variant="success">{notice}</Callout> : null}
      </div>
      {failure ? (
        <Callout variant="danger" title={failure.title}>
          {failure.message}
        </Callout>
      ) : null}

      <div className={styles.grid}>
        <section className={shared.panel} aria-labelledby="user-account">
          <div className={shared.panelHead}>
            <h2 id="user-account" className={shared.panelTitle}>
              Account
            </h2>
            {u.suspended ? (
              <Badge variant="danger" dot>
                Suspended
              </Badge>
            ) : (
              <Badge variant="success" dot>
                Active
              </Badge>
            )}
          </div>
          <div className={shared.panelBody}>
            <KeyValueList
              items={[
                { id: 'id', label: 'User id', value: u.id, mono: true },
                { id: 'email', label: 'Email', value: u.email ?? 'Not shared' },
                { id: 'roles', label: 'Roles', value: <RoleBadges roles={u.roles} /> },
                { id: 'plan', label: 'Plan', value: u.plan },
                {
                  id: 'perm',
                  label: 'Permissions',
                  value: `${u.permissions.length} granted`,
                  hint: `Permissions version ${u.permissionsVersion}`,
                },
              ]}
            />
          </div>
        </section>

        <section className={shared.panel} aria-labelledby="user-roles">
          <div className={shared.panelHead}>
            <h2 id="user-roles" className={shared.panelTitle}>
              Roles
            </h2>
            <span className={shared.panelHint}>
              {canAssign
                ? 'Changes apply within about a minute.'
                : 'You can read roles but not change them.'}
            </span>
          </div>
          <div className={shared.panelBody}>
            <ul className={styles.roleList}>
              {roleList.map((role) => {
                const held = u.roles.includes(role.name)
                const privileged = PRIVILEGED_ROLES.includes(role.name)
                const blocked = privileged && !canPrivileged
                const busy = pendingKey === `${held ? 'revoke' : 'grant'}:${role.name}`
                const persona = (personas as readonly string[]).includes(role.name)
                  ? (role.name as Persona)
                  : null
                return (
                  <li key={role.name} className={styles.roleRow}>
                    <div className={styles.roleText}>
                      <span className={styles.roleName}>
                        {persona ? <PersonaBadge persona={persona} /> : <Badge>{role.name}</Badge>}
                        {held ? <span className={styles.held}>Held</span> : null}
                      </span>
                      {role.description ? (
                        <span className={shared.subtle}>{role.description}</span>
                      ) : null}
                      {blocked && canAssign ? (
                        <span className={shared.subtle}>Only an owner can change {role.name}.</span>
                      ) : null}
                    </div>
                    {canAssign ? (
                      <Button
                        size="sm"
                        variant={held ? 'secondary' : 'primary'}
                        disabled={blocked || act.isPending}
                        loading={busy}
                        aria-label={`${held ? 'Revoke' : 'Grant'} ${role.name}${held ? ' from' : ' to'} ${name}`}
                        onClick={() =>
                          act.mutate({ kind: held ? 'revoke' : 'grant', role: role.name })
                        }
                      >
                        {held ? 'Revoke' : 'Grant'}
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {roles.isError ? (
              <Callout variant="warning" title="The full role list did not load">
                Showing only the roles this user holds. {errorMessage(roles.error)}
              </Callout>
            ) : null}
          </div>
        </section>

        <section className={shared.panel} aria-labelledby="user-access">
          <div className={shared.panelHead}>
            <h2 id="user-access" className={shared.panelTitle}>
              Access
            </h2>
          </div>
          <div className={shared.panelBody}>
            <p className={shared.muted}>
              {u.suspended
                ? `${name} cannot use the platform. Restoring them lets them back in within about a minute.`
                : `Suspending ${name} blocks them from the platform within about a minute. Their data stays where it is.`}
            </p>
            {canSuspend ? (
              <div className={styles.actions}>
                {u.suspended ? (
                  <Button
                    variant="secondary"
                    loading={pendingKey === 'restore:'}
                    disabled={act.isPending}
                    onClick={() => act.mutate({ kind: 'restore' })}
                  >
                    Restore user
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    disabled={act.isPending}
                    onClick={() => setConfirmSuspend(true)}
                    {...(isSelf ? { title: 'This is your own account' } : {})}
                  >
                    Suspend user
                  </Button>
                )}
              </div>
            ) : (
              <p className={shared.subtle}>
                Suspending and restoring needs the users:write permission.
              </p>
            )}
          </div>
        </section>

        <section className={shared.panel} aria-labelledby="user-plan">
          <div className={shared.panelHead}>
            <h2 id="user-plan" className={shared.panelTitle}>
              Plan
            </h2>
            <span className={shared.panelHint}>Billing is simulated; a plan only sets limits.</span>
          </div>
          <div className={shared.panelBody}>
            {canPlan ? (
              <form
                className={styles.planForm}
                onSubmit={(event) => {
                  event.preventDefault()
                  act.mutate({ kind: 'plan', plan: chosenPlan })
                }}
              >
                <Field label="Plan" className={styles.planField}>
                  <Select value={chosenPlan} onChange={(event) => setPlan(event.target.value)}>
                    {PLAN_NAMES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  type="submit"
                  loading={pendingKey === 'plan:'}
                  disabled={chosenPlan === u.plan || act.isPending}
                >
                  Change plan
                </Button>
              </form>
            ) : (
              <p className={shared.muted}>
                On the <strong>{u.plan}</strong> plan. Only an owner can change plans.
              </p>
            )}
          </div>
        </section>
      </div>

      {session.can(PERMISSIONS.auditRead) ? <UserActivity userId={u.id} /> : null}

      <Dialog
        open={confirmSuspend}
        onOpenChange={setConfirmSuspend}
        title={`Suspend ${name}?`}
        description="They will be signed out of the platform within about a minute. You can restore them at any time."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmSuspend(false)
                act.mutate({ kind: 'suspend' })
              }}
            >
              Suspend user
            </Button>
          </>
        }
      />
    </div>
  )
}

function UserActivity({ userId }: { userId: string }) {
  const audit = useAuthQuery<Page<AuditEntry>>('/v1/admin/audit', {
    targetId: userId,
    page: 0,
    size: 10,
  })
  const entries = audit.data?.items ?? []
  const names = useNames(entries.map((e) => e.actorId))
  return (
    <section className={shared.panel} aria-labelledby="user-activity">
      <div className={shared.panelHead}>
        <h2 id="user-activity" className={shared.panelTitle}>
          Recent changes
        </h2>
        <ModuleLink to={`/audit?target=${userId}`} className={shared.link}>
          Full audit trail
        </ModuleLink>
      </div>
      <div className={shared.panelBody}>
        {audit.isPending ? (
          <LoadingBlock label="Loading changes" rows={2} />
        ) : audit.isError ? (
          <ErrorPanel error={audit.error} subject="changes" onRetry={() => void audit.refetch()} />
        ) : entries.length === 0 ? (
          <p className={shared.muted}>
            No role, plan or access changes have been recorded for this user.
          </p>
        ) : (
          <Timeline
            label="Recent changes"
            compact
            items={entries.map((e) => ({
              id: e.id,
              title: `${auditTitle(e)}${auditDetail(e) ? `: ${auditDetail(e)}` : ''}`,
              description: `By ${names.nameOf(e.actorId)}`,
              time: formatDateTime(e.at),
              dateTime: e.at,
              tone: auditTone(e),
            }))}
          />
        )}
      </div>
    </section>
  )
}
