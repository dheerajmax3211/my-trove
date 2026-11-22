import { isApiError, useApiQuery } from '@platform/api-client'
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWorkspaceSession } from '@platform/workspace-kit'
import { usePageTitle } from '../lib/usePageTitle'
import { CapacityBar } from './CapacityBar'
import { Confirm } from './Confirm'
import { SecretReveal } from './SecretReveal'
import {
  paths,
  type CreatedWebhook,
  type Delivery,
  type DeveloperApp,
  type WebhookEndpoint,
} from './contract'
import { deliveryLabel, when } from './format'
import { capacity, limitsFor } from './limits'
import { validateCallbackUrl } from './urls'
import {
  useCreateWebhook,
  useDeveloperApps,
  useDisableWebhook,
  useEventTypes,
  useReplayDelivery,
  useRotateWebhookSecret,
  useWebhooksOfApps,
} from './hooks'
import styles from './Developer.module.css'

/** Endpoints across apps, the form that adds one (with the signing secret shown once), and each endpoint's log. */
export function Webhooks() {
  usePageTitle('Webhooks')
  const session = useWorkspaceSession()
  const apps = useDeveloperApps()
  const list = apps.data ?? []
  const hooks = useWebhooksOfApps(list)
  const limit = limitsFor(session.plan).webhooks
  const liveCount = hooks.webhooks.filter((hook) => hook.disabledAt === null).length
  const cap = capacity(liveCount, limit)
  const appName = new Map(list.map((app) => [app.id, app.name]))

  return (
    <div className={styles.stack}>
      <CapacityBar label="Active endpoints on your plan" capacity={cap} />

      <section aria-labelledby="endpoints-heading" className={styles.stack}>
        <h2 id="endpoints-heading">Endpoints</h2>
        {hooks.pending && hooks.webhooks.length === 0 ? (
          <p className={styles.muted}>Loading endpoints.</p>
        ) : hooks.webhooks.length === 0 ? (
          <EmptyState
            title="No endpoints yet"
            description="An endpoint is an address that receives events from your data. Add one below."
          />
        ) : (
          <ul className={styles.list} aria-label="Webhook endpoints">
            {hooks.webhooks.map((hook) => (
              <EndpointRow
                key={hook.id}
                hook={hook}
                appName={appName.get(hook.appId) ?? 'Deleted app'}
              />
            ))}
          </ul>
        )}
      </section>

      <AddEndpoint apps={list.filter((app) => !app.revokedAt)} full={cap.full} limit={limit} />

      <DeliveryLog endpoints={hooks.webhooks} />
    </div>
  )
}

function AddEndpoint({
  apps,
  full,
  limit,
}: {
  apps: readonly DeveloperApp[]
  full: boolean
  limit: number
}) {
  const [params] = useSearchParams()
  const session = useWorkspaceSession()
  const events = useEventTypes()
  const create = useCreateWebhook()
  const [appId, setAppId] = useState(params.get('app') ?? '')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [errors, setErrors] = useState<{ app?: string; url?: string; events?: string }>({})
  const [created, setCreated] = useState<CreatedWebhook | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next: typeof errors = {}
    if (!appId) next.app = 'Choose the app this endpoint belongs to.'
    const urlProblem = validateCallbackUrl(url)
    if (urlProblem) next.url = urlProblem
    if (chosen.length === 0) next.events = 'Pick at least one event type.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    create.mutate(
      { appId, url: url.trim(), description: description.trim(), eventTypes: chosen },
      {
        onSuccess: (result) => {
          setCreated(result)
          setUrl('')
          setDescription('')
          setChosen([])
          create.reset()
        },
      },
    )
  }

  const serverMessage = create.isError
    ? isApiError(create.error) && create.error.status === 409
      ? (create.error.detail ?? 'You have reached the limit for your plan.')
      : (create.error.detail ?? create.error.title)
    : undefined

  return (
    <section aria-labelledby="add-endpoint" className={styles.stack}>
      <h2 id="add-endpoint">Add an endpoint</h2>
      {apps.length === 0 ? (
        <Callout variant="note" title="Register an app first">
          An endpoint belongs to an app. Register one on the Apps page.
        </Callout>
      ) : (
        <form className={styles.formGrid} onSubmit={submit} noValidate aria-label="Add an endpoint">
          {full ? (
            <Callout variant="warning" title="Your plan is full">
              Your {session.plan} plan allows {limit} active webhook endpoints. Disable one to add
              another.
            </Callout>
          ) : null}
          <Field label="App" required error={errors.app} controlId="endpoint-app">
            <Select
              value={appId}
              disabled={full}
              onChange={(event) => setAppId(event.target.value)}
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
            label="Address"
            required
            error={errors.url}
            controlId="endpoint-url"
            description="https://, or http:// on localhost or 127.0.0.1 for local development."
          >
            <Input
              type="url"
              value={url}
              disabled={full}
              placeholder="https://hooks.example.test/my-trove"
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
          <Field label="Description" controlId="endpoint-description" description="Optional.">
            <Textarea
              value={description}
              rows={2}
              disabled={full}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <fieldset className={styles.stack} disabled={full}>
            <legend>Events to send</legend>
            {errors.events ? (
              <p role="alert" className={styles.muted}>
                {errors.events}
              </p>
            ) : null}
            {(events.data ?? []).map((type) => (
              <Checkbox
                key={type.name}
                label={<code>{type.name}</code>}
                description={type.description}
                checked={chosen.includes(type.name)}
                onCheckedChange={(checked) =>
                  setChosen((current) =>
                    checked === true
                      ? [...current.filter((item) => item !== type.name), type.name]
                      : current.filter((item) => item !== type.name),
                  )
                }
              />
            ))}
          </fieldset>
          {serverMessage ? (
            <Callout variant="danger" title="The endpoint was not added">
              {serverMessage}
            </Callout>
          ) : null}
          <div className={styles.row}>
            <Button type="submit" disabled={full} loading={create.isPending}>
              Add endpoint
            </Button>
          </div>
        </form>
      )}

      {created ? (
        <SecretReveal
          open
          title={`Signing secret for ${created.url}`}
          label="Signing secret"
          value={created.secret}
          explanation={
            <>
              Check each delivery before you trust it. Compute HMAC-SHA256 over{' '}
              <code>timestamp.body</code> with this secret, compare it to the <code>v1</code> value
              in <code>X-Trove-Signature</code>, and refuse timestamps more than five minutes old.
            </>
          }
          onClose={() => setCreated(null)}
        />
      ) : null}
    </section>
  )
}

function EndpointRow({ hook, appName }: { hook: WebhookEndpoint; appName: string }) {
  const [confirm, setConfirm] = useState<null | 'rotate' | 'disable'>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const rotate = useRotateWebhookSecret()
  const disable = useDisableWebhook()
  const live = hook.disabledAt === null

  return (
    <li className={styles.listItem}>
      <div className={styles.stack}>
        <span className={styles.mono}>{hook.url}</span>
        <span className={styles.muted}>
          {appName} ·{' '}
          {hook.eventTypes.map((type) => (
            <code key={type}>{type} </code>
          ))}
        </span>
      </div>
      <div className={styles.row}>
        <Badge variant={live ? 'success' : 'neutral'}>{live ? 'Active' : 'Disabled'}</Badge>
        {live ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirm('rotate')}>
              Rotate secret
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm('disable')}>
              Disable
            </Button>
          </>
        ) : null}
      </div>

      <Confirm
        open={confirm === 'rotate'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Rotate the signing secret?"
        description="Deliveries signed with the old secret will fail verification from now on. Update your receiver first, or right after."
        confirmLabel="Rotate secret"
        busy={rotate.isPending}
        error={rotate.isError ? (rotate.error.detail ?? rotate.error.title) : undefined}
        onConfirm={() =>
          rotate.mutate(
            { id: hook.id },
            {
              onSuccess: (result) => {
                setConfirm(null)
                setSecret(result.secret)
              },
            },
          )
        }
      />
      <Confirm
        open={confirm === 'disable'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Disable this endpoint?"
        description="It stops receiving events. Its delivery log stays readable, and disabling frees a slot on your plan."
        confirmLabel="Disable endpoint"
        danger
        busy={disable.isPending}
        error={disable.isError ? (disable.error.detail ?? disable.error.title) : undefined}
        onConfirm={() => disable.mutate({ id: hook.id }, { onSuccess: () => setConfirm(null) })}
      />
      {secret ? (
        <SecretReveal
          open
          title={`New signing secret for ${hook.url}`}
          label="Signing secret"
          value={secret}
          explanation="The old secret no longer signs deliveries. Save this one now."
          onClose={() => setSecret(null)}
        />
      ) : null}
    </li>
  )
}

function DeliveryLog({ endpoints }: { endpoints: readonly WebhookEndpoint[] }) {
  const [chosen, setChosen] = useState('')
  const endpoint = endpoints.find((hook) => hook.id === chosen) ?? endpoints[0]
  const log = useApiQuery<Delivery[]>(paths.deliveries(endpoint?.id ?? 'none'), {
    enabled: endpoint !== undefined,
    refetchInterval: 5000,
  })
  const replay = useReplayDelivery()
  const [message, setMessage] = useState('')

  if (endpoints.length === 0) return null

  return (
    <section aria-labelledby="delivery-log" className={styles.stack}>
      <h2 id="delivery-log">Delivery log</h2>
      <Field label="Endpoint" controlId="log-endpoint">
        <Select
          value={endpoint?.id ?? ''}
          onChange={(event) => {
            setChosen(event.target.value)
            setMessage('')
          }}
        >
          {endpoints.map((hook) => (
            <option key={hook.id} value={hook.id}>
              {hook.url}
            </option>
          ))}
        </Select>
      </Field>
      {message ? (
        <p role="status" className={styles.muted}>
          {message}
        </p>
      ) : null}
      {log.isPending ? (
        <p className={styles.muted}>Loading deliveries.</p>
      ) : (log.data ?? []).length === 0 ? (
        <p className={styles.muted}>No deliveries for this endpoint yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.muted}>Newest first. The last 100 are kept.</caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Status</th>
                <th scope="col">Attempts</th>
                <th scope="col">Last response</th>
                <th scope="col">Created</th>
                <th scope="col">
                  <span className={styles.muted}>Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(log.data ?? []).map((delivery) => (
                <tr key={delivery.id}>
                  <td>
                    <code>{delivery.eventType}</code>
                    {delivery.replayOf ? <span className={styles.muted}> (replay)</span> : null}
                  </td>
                  <td>
                    <Badge variant={delivery.status === 'DELIVERED' ? 'success' : 'warning'}>
                      {deliveryLabel(delivery.status)}
                    </Badge>
                  </td>
                  <td>{delivery.attempts}</td>
                  <td>
                    {delivery.lastStatusCode ?? '—'}
                    {delivery.lastError ? (
                      <span className={styles.muted}> {delivery.lastError}</span>
                    ) : null}
                  </td>
                  <td>{when(delivery.createdAt)}</td>
                  <td>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={replay.isPending}
                      onClick={() =>
                        endpoint &&
                        replay.mutate(
                          { webhookId: endpoint.id, deliveryId: delivery.id },
                          {
                            onSuccess: () =>
                              setMessage(
                                `Replaying ${delivery.eventType}. It appears at the top of the log.`,
                              ),
                            onError: (error) => setMessage(error.detail ?? error.title),
                          },
                        )
                      }
                    >
                      Replay {delivery.eventType}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
