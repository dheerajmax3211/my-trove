import { useAuth } from '@platform/auth-web'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Skeleton,
  useToast,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { CopyButton } from '../../../components/CopyButton'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { errorMessage, statusOf } from '../../../lib/errors'
import { isUuid } from '../../../lib/format'
import { usePageTitle } from '../../../lib/usePageTitle'
import { useRuntime } from '../../../runtime/context'
import { useProfile } from '../../session/profile'
import { KNOWN_ROLES, ROLE_ADMIN, ROLE_USER, type AdminUser } from '../../session/types'
import { useAdminUser, useRoleChange } from '../hooks'

/** Why a role cannot be revoked from this user, or `null` when it can. Mirrors the auth-service rules. */
export function revokeBlockedReason(
  role: string,
  target: AdminUser,
  actorId: string,
): string | null {
  if (role === ROLE_USER) return 'Every account keeps the USER role; it cannot be revoked.'
  if (role === ROLE_ADMIN && target.id === actorId)
    return 'You cannot revoke your own ADMIN role. Ask another admin to do it.'
  return null
}

function RoleRow({ user, role }: { user: AdminUser; role: string }) {
  const actor = useProfile()
  const { toast } = useToast()
  const has = user.roles.includes(role)
  const grant = useRoleChange(user.id, 'grant')
  const revoke = useRoleChange(user.id, 'revoke')
  const [confirming, setConfirming] = useState(false)
  const blocked = has ? revokeBlockedReason(role, user, actor.id) : null
  const name = user.email ?? user.id

  return (
    <li>
      <div className="hub-row" style={{ justifyContent: 'space-between' }}>
        <span className="hub-row">
          <strong>{role}</strong>
          <Badge variant={has ? 'success' : 'neutral'}>{has ? 'Granted' : 'Not granted'}</Badge>
        </span>
        {has ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={blocked !== null}
            aria-label={`Revoke ${role} from ${name}`}
            aria-describedby={blocked ? `blocked-${role}` : undefined}
            onClick={() => setConfirming(true)}
          >
            Revoke
          </Button>
        ) : (
          <Button
            size="sm"
            loading={grant.isPending}
            aria-label={`Grant ${role} to ${name}`}
            onClick={() =>
              grant.mutate(
                { role },
                {
                  onSuccess: () =>
                    toast({ title: `${role} granted`, description: name, variant: 'success' }),
                },
              )
            }
          >
            Grant
          </Button>
        )}
      </div>
      {blocked ? (
        <span id={`blocked-${role}`} className="hub-muted">
          {blocked}
        </span>
      ) : null}
      {grant.error ? <p role="alert">{errorMessage(grant.error)}</p> : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open)
          if (!open) revoke.reset()
        }}
        title={`Revoke ${role} from ${name}?`}
        description={
          role === ROLE_ADMIN
            ? 'They lose access to this admin area immediately.'
            : 'They may lose access to features that depend on this role.'
        }
        confirmLabel={`Revoke ${role}`}
        pending={revoke.isPending}
        error={revoke.error}
        {...(statusOf(revoke.error) === 400
          ? {
              errorText:
                'The server refused: the USER role and your own ADMIN role cannot be revoked.',
            }
          : {})}
        onConfirm={() =>
          revoke.mutate(
            { role },
            {
              onSuccess: () => {
                toast({ title: `${role} revoked`, description: name, variant: 'success' })
                setConfirming(false)
              },
            },
          )
        }
      />
    </li>
  )
}

function LookupResult({ userId }: { userId: string }) {
  const lookup = useAdminUser(userId)
  if (lookup.isPending)
    return (
      <div className="hub-stack-sm" aria-busy="true" aria-label="Looking up user">
        <Skeleton height={24} width="50%" />
        <Skeleton height={80} />
      </div>
    )
  if (lookup.isError) {
    const status = statusOf(lookup.error)
    return (
      <p role="alert">
        {status === 404
          ? 'No user has that ID. Check it and try again.'
          : status === 403
            ? 'The server says you are not an administrator.'
            : errorMessage(lookup.error)}
      </p>
    )
  }
  const user = lookup.data
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{user.displayName ?? user.email ?? user.id}</CardTitle>
        <CardDescription>{user.email ?? 'No email on file'}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="hub-list" aria-label={`Roles for ${user.email ?? user.id}`}>
          {KNOWN_ROLES.map((role) => (
            <RoleRow key={role} user={user} role={role} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function AdminPage() {
  usePageTitle('Admin')
  const { demo } = useRuntime()
  const { user: signedIn } = useAuth()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string>()
  const [userId, setUserId] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = input.trim()
    if (!isUuid(trimmed)) {
      setUserId(null)
      return setError('A user ID looks like 0198a1ce-0000-7000-8000-000000000001.')
    }
    setError(undefined)
    setUserId(trimmed.toLowerCase())
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Users and roles"
        description="Look up a user by their ID and grant or revoke roles. Only administrators can see this page."
      />
      <div className="hub-stack">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Guardrails</CardTitle>
            <CardDescription>The server enforces these, and so does this page.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="hub-bullets">
              <li>The USER role cannot be revoked from anyone.</li>
              <li>You cannot revoke your own ADMIN role. Ask another admin.</li>
              <li>Users are found by ID only; there is no search by name or email.</li>
            </ul>
          </CardContent>
        </Card>

        <form className="hub-toolbar" onSubmit={submit} noValidate>
          <Field
            label="User ID"
            error={error}
            description="Users can copy theirs from their Account page."
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </Field>
          <Button type="submit">Look up user</Button>
        </form>

        {demo ? (
          <Card>
            <CardHeader>
              <CardTitle as="h2">Demo users</CardTitle>
              <CardDescription>IDs of the people in the demo, ready to look up.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="hub-list">
                {demo.users.map((u) => (
                  <li key={u.uid}>
                    <span className="hub-row">
                      <strong>{u.displayName}</strong>
                      {u.uid === signedIn?.uid ? <Badge variant="accent">You</Badge> : null}
                    </span>
                    <span className="hub-mono">{u.userId}</span>
                    <span className="hub-row">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Use ${u.displayName}'s ID`}
                        onClick={() => {
                          setInput(u.userId)
                          setError(undefined)
                          setUserId(u.userId)
                        }}
                      >
                        Use this ID
                      </Button>
                      <CopyButton value={u.userId} label="Copy" />
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {userId ? <LookupResult key={userId} userId={userId} /> : null}
      </div>
    </>
  )
}
