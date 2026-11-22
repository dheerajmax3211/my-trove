import { isApiError } from '@platform/api-client'
import { Badge, Button, Callout, Checkbox, EmptyState, Field, Input, Select } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { Confirm } from './Confirm'
import { CapacityBar } from './CapacityBar'
import { SecretReveal } from './SecretReveal'
import type { ApiKey, DeveloperApp } from './contract'
import { when, keyState } from './format'
import { capacity, limitsFor } from './limits'
import {
  useDeveloperApps,
  useIssueKey,
  useKeysOfApps,
  useRevokeKey,
  useScopes,
  type IssueKeyResult,
} from './hooks'
import styles from './Developer.module.css'

/** API keys across the owner's apps, the form that issues one, and revoking. */
export function Keys() {
  usePageTitle('API keys')
  const session = useWorkspaceSession()
  const apps = useDeveloperApps()
  const list = apps.data ?? []
  const keys = useKeysOfApps(list)
  const now = new Date()
  const limit = limitsFor(session.plan).keys
  const live = keys.keys.filter((key) => keyState(key, now) === 'Active')
  const cap = capacity(live.length, limit)
  const appName = new Map(list.map((app) => [app.id, app.name]))
  const [revoking, setRevoking] = useState<ApiKey | null>(null)
  const revoke = useRevokeKey()

  return (
    <div className={styles.stack}>
      <CapacityBar label="Active keys on your plan" capacity={cap} />

      <section aria-labelledby="keys-list" className={styles.stack}>
        <h2 id="keys-list">Your keys</h2>
        {keys.pending && keys.keys.length === 0 ? (
          <p className={styles.muted}>Loading keys.</p>
        ) : keys.keys.length === 0 ? (
          <EmptyState
            title="No keys yet"
            description="Issue a key below. It is shown once, so copy it when it appears."
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.muted}>
                Keys show their prefix only. The full value was shown once, when issued.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">App</th>
                  <th scope="col">Key</th>
                  <th scope="col">Scopes</th>
                  <th scope="col">Last used</th>
                  <th scope="col">Expires</th>
                  <th scope="col">State</th>
                  <th scope="col">
                    <span className={styles.muted}>Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {keys.keys.map((key) => {
                  const state = keyState(key, now)
                  return (
                    <tr key={key.id}>
                      <td>{key.name}</td>
                      <td>{appName.get(key.appId) ?? 'Deleted app'}</td>
                      <td className={styles.mono}>{key.keyPrefix}…</td>
                      <td>
                        {key.scopes.map((scope) => (
                          <code key={scope} className={styles.mono}>
                            {scope}{' '}
                          </code>
                        ))}
                      </td>
                      <td>{key.lastUsedAt ? when(key.lastUsedAt) : 'Never'}</td>
                      <td>{key.expiresAt ? when(key.expiresAt) : 'No expiry'}</td>
                      <td>
                        <Badge variant={state === 'Active' ? 'success' : 'neutral'}>{state}</Badge>
                      </td>
                      <td>
                        {state === 'Active' ? (
                          <Button variant="ghost" size="sm" onClick={() => setRevoking(key)}>
                            Revoke {key.name}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <IssueKey apps={list.filter((app) => !app.revokedAt)} full={cap.full} limit={limit} />

      <Confirm
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke ${revoking?.name ?? 'this key'}?`}
        description="Anything using this key stops working within about a minute. This cannot be undone, but you can issue a new key."
        confirmLabel="Revoke key"
        danger
        busy={revoke.isPending}
        error={revoke.isError ? (revoke.error.detail ?? revoke.error.title) : undefined}
        onConfirm={() => {
          if (!revoking) return
          revoke.mutate({ keyId: revoking.id }, { onSuccess: () => setRevoking(null) })
        }}
      />
    </div>
  )
}

function IssueKey({
  apps,
  full,
  limit,
}: {
  apps: readonly DeveloperApp[]
  full: boolean
  limit: number
}) {
  const [params] = useSearchParams()
  const preset = params.get('app') ?? ''
  const scopes = useScopes()
  const issue = useIssueKey()
  const [appId, setAppId] = useState(preset)
  const [name, setName] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [expires, setExpires] = useState('')
  const [errors, setErrors] = useState<{ app?: string; name?: string; scopes?: string }>({})
  const [issued, setIssued] = useState<IssueKeyResult | null>(null)
  const session = useWorkspaceSession()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next: typeof errors = {}
    if (!appId) next.app = 'Choose the app this key belongs to.'
    if (name.trim() === '') next.name = 'Name the key, so you can tell it apart later.'
    if (chosen.length === 0) next.scopes = 'Pick at least one scope.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    issue.mutate(
      {
        appId,
        name: name.trim(),
        scopes: chosen,
        ...(expires ? { expiresAt: new Date(expires).toISOString() } : {}),
      },
      {
        onSuccess: (result) => {
          setIssued(result)
          setName('')
          setChosen([])
          setExpires('')
          issue.reset()
        },
      },
    )
  }

  const serverMessage = issue.isError
    ? isApiError(issue.error) && issue.error.status === 409
      ? (issue.error.detail ?? 'You have reached the limit for your plan.')
      : (issue.error.detail ?? issue.error.title)
    : undefined

  return (
    <section aria-labelledby="issue-key" className={styles.stack}>
      <h2 id="issue-key">Issue a key</h2>
      {apps.length === 0 ? (
        <Callout variant="note" title="Register an app first">
          A key belongs to an app. <a href="/developer/apps">Register an app</a> and come back.
        </Callout>
      ) : (
        <form className={styles.formGrid} onSubmit={submit} noValidate aria-label="Issue a key">
          {full ? (
            <Callout variant="warning" title="Your plan is full">
              Your {session.plan} plan allows {limit} active API keys. Revoke one to issue another.
            </Callout>
          ) : null}
          <Field label="App" required error={errors.app} controlId="issue-app">
            <Select
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
              disabled={full}
            >
              <option value="">Choose an app</option>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Key name"
            required
            error={errors.name}
            controlId="issue-name"
            description="For example: staging server."
          >
            <Input
              value={name}
              maxLength={80}
              disabled={full}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <fieldset className={styles.stack} disabled={full}>
            <legend>Scopes</legend>
            {errors.scopes ? (
              <p role="alert" className={styles.muted}>
                {errors.scopes}
              </p>
            ) : null}
            {scopes.isPending ? <p className={styles.muted}>Loading the scopes.</p> : null}
            {(scopes.data ?? []).map((scope) => (
              <Checkbox
                key={scope.name}
                label={<code>{scope.name}</code>}
                description={`${scope.description}. Grants ${scope.permissions.join(', ')}.`}
                checked={chosen.includes(scope.name)}
                onCheckedChange={(checked) =>
                  setChosen((current) =>
                    checked === true
                      ? [...current.filter((item) => item !== scope.name), scope.name]
                      : current.filter((item) => item !== scope.name),
                  )
                }
              />
            ))}
          </fieldset>
          <Field
            label="Expires"
            controlId="issue-expires"
            description="Optional. Leave empty for a key that does not expire."
          >
            <Input
              type="datetime-local"
              value={expires}
              disabled={full}
              onChange={(event) => setExpires(event.target.value)}
            />
          </Field>
          {serverMessage ? (
            <Callout variant="danger" title="The key was not issued">
              {serverMessage}
            </Callout>
          ) : null}
          <div className={styles.row}>
            <Button type="submit" disabled={full} loading={issue.isPending}>
              Issue key
            </Button>
          </div>
        </form>
      )}

      {issued ? (
        <SecretReveal
          open
          title={`Key ${issued.name} is ready`}
          label="API key"
          value={issued.key}
          explanation={
            <>
              Send it as <code>Authorization: Bearer &lt;key&gt;</code>. My-Trove does not keep the
              full value, so this console cannot show it again.
            </>
          }
          onClose={() => setIssued(null)}
        />
      ) : null}
    </section>
  )
}
