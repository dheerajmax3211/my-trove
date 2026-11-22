import { isApiError, useApiQuery } from '@platform/api-client'
import {
  Badge,
  BentoCard,
  BentoGrid,
  Button,
  Callout,
  KeyIcon,
  LinkIcon,
  CodeIcon,
} from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { AppFields, appFieldsValid, type AppFieldErrors, type AppFieldValues } from './AppFields'
import { Confirm } from './Confirm'
import { SecretReveal } from './SecretReveal'
import {
  paths,
  type ApiKey,
  type DeveloperApp,
  type RotatedSecret,
  type WebhookEndpoint,
} from './contract'
import { keyState, when } from './format'
import {
  useDeleteApp,
  useDeveloperApp,
  useRevokeSecret,
  useRotateSecret,
  useUpdateApp,
} from './hooks'
import styles from './Developer.module.css'

/** One app: its details, its client secret, its keys and its endpoints, and deleting it. */
export function AppDetail() {
  const { id = '' } = useParams()
  const app = useDeveloperApp(id)
  usePageTitle(app.data?.name ?? 'App')

  if (app.isPending) return <p className={styles.muted}>Loading the app.</p>
  if (app.isError) {
    const missing = isApiError(app.error) && app.error.status === 404
    return (
      <Callout
        variant="danger"
        title={missing ? 'No app with this address' : 'We could not load the app'}
      >
        {missing
          ? 'It may have been deleted, or it belongs to another developer. Go back to your apps.'
          : 'Check your connection and try again.'}{' '}
        <Link to="/developer/apps">Back to apps</Link>
      </Callout>
    )
  }
  return <AppView app={app.data} />
}

function AppView({ app }: { app: DeveloperApp }) {
  const navigate = useNavigate()
  const live = app.revokedAt === null
  const keys = useApiQuery<ApiKey[]>(paths.appKeys(app.id))
  const hooks = useApiQuery<WebhookEndpoint[]>(paths.appWebhooks(app.id))
  const [revealedSecret, setRevealedSecret] = useState<{ title: string; value: string } | null>(
    null,
  )
  const [confirm, setConfirm] = useState<null | 'rotate' | 'revokeSecret' | 'delete'>(null)
  const rotate = useRotateSecret()
  const revokeSecret = useRevokeSecret()
  const remove = useDeleteApp()
  const now = new Date()

  return (
    <>
      <div className={styles.row}>
        <h2>{app.name}</h2>
        <Badge variant={live ? 'success' : 'danger'}>{live ? 'Active' : 'Deleted'}</Badge>
      </div>
      <p className={styles.mono}>{app.clientId}</p>
      {!live ? (
        <Callout variant="danger" title="This app was deleted">
          Its keys no longer work. You can read its history, but you cannot change it.
        </Callout>
      ) : null}

      <BentoGrid>
        <BentoCard span={7} title="Details" icon={<CodeIcon size={18} />}>
          <EditApp key={`${app.id}:${app.updatedAt}`} app={app} disabled={!live} />
        </BentoCard>

        <BentoCard span={5} title="Client secret" icon={<KeyIcon size={18} />}>
          <p className={styles.muted}>
            {app.hasClientSecret
              ? `A secret is set${app.secretRotatedAt ? `, last rotated ${when(app.secretRotatedAt)}` : ''}. The console never shows it again.`
              : 'This app has no secret. Rotate to create one.'}
          </p>
          <div className={styles.row}>
            <Button variant="secondary" disabled={!live} onClick={() => setConfirm('rotate')}>
              Rotate secret
            </Button>
            <Button
              variant="secondary"
              disabled={!live || !app.hasClientSecret}
              onClick={() => setConfirm('revokeSecret')}
            >
              Revoke secret
            </Button>
          </div>
          <p className={styles.muted}>
            Rotating gives a new secret at once. The old one stops matching straight away.
          </p>
        </BentoCard>

        <BentoCard span={7} title="API keys" icon={<KeyIcon size={18} />}>
          {keys.isPending ? (
            <p className={styles.muted}>Loading keys.</p>
          ) : (keys.data ?? []).length === 0 ? (
            <p className={styles.muted}>No keys for this app.</p>
          ) : (
            <ul className={styles.list} aria-label="Keys of this app">
              {(keys.data ?? []).map((key) => (
                <li key={key.id} className={styles.listItem}>
                  <span>
                    {key.name} <span className={styles.mono}>{key.keyPrefix}…</span>
                  </span>
                  <Badge variant={keyState(key, now) === 'Active' ? 'success' : 'neutral'}>
                    {keyState(key, now)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <Link to={`/developer/keys?app=${app.id}`}>Keys for this app</Link>
        </BentoCard>

        <BentoCard span={5} title="Webhooks" icon={<LinkIcon size={18} />}>
          {hooks.isPending ? (
            <p className={styles.muted}>Loading endpoints.</p>
          ) : (hooks.data ?? []).length === 0 ? (
            <p className={styles.muted}>No endpoints for this app.</p>
          ) : (
            <ul className={styles.list} aria-label="Endpoints of this app">
              {(hooks.data ?? []).map((hook) => (
                <li key={hook.id} className={styles.listItem}>
                  <span className={styles.mono}>{hook.url}</span>
                  <Badge variant={hook.disabledAt ? 'neutral' : 'success'}>
                    {hook.disabledAt ? 'Disabled' : 'Active'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <Link to="/developer/webhooks">Webhooks</Link>
        </BentoCard>

        <BentoCard span={12} title="Delete this app">
          <p className={styles.muted}>
            Deleting revokes the app and every key it has. They stop working within about a minute.
            This cannot be undone.
          </p>
          <div>
            <Button variant="danger" disabled={!live} onClick={() => setConfirm('delete')}>
              Delete app
            </Button>
          </div>
        </BentoCard>
      </BentoGrid>

      <Confirm
        open={confirm === 'rotate'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Rotate the client secret?"
        description="The current secret stops matching at once. Anything that still sends it will be refused until you update it."
        confirmLabel="Rotate secret"
        busy={rotate.isPending}
        error={rotate.isError ? (rotate.error.detail ?? rotate.error.title) : undefined}
        onConfirm={() =>
          rotate.mutate(
            { id: app.id },
            {
              onSuccess: (result: RotatedSecret) => {
                setConfirm(null)
                setRevealedSecret({
                  title: `New client secret for ${app.name}`,
                  value: result.clientSecret,
                })
              },
            },
          )
        }
      />
      <Confirm
        open={confirm === 'revokeSecret'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Revoke the client secret?"
        description="Nothing can exchange this app's secret until you rotate it to a new one."
        confirmLabel="Revoke secret"
        danger
        busy={revokeSecret.isPending}
        error={
          revokeSecret.isError ? (revokeSecret.error.detail ?? revokeSecret.error.title) : undefined
        }
        onConfirm={() => revokeSecret.mutate({ id: app.id }, { onSuccess: () => setConfirm(null) })}
      />
      <Confirm
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Delete ${app.name}?`}
        description="The app is revoked and all of its keys stop working. This cannot be undone."
        confirmLabel="Delete app"
        danger
        busy={remove.isPending}
        error={remove.isError ? (remove.error.detail ?? remove.error.title) : undefined}
        onConfirm={() =>
          remove.mutate(
            { id: app.id },
            {
              onSuccess: () => {
                setConfirm(null)
                void navigate('/developer/apps')
              },
            },
          )
        }
      />

      {revealedSecret ? (
        <SecretReveal
          open
          title={revealedSecret.title}
          label="Client secret"
          value={revealedSecret.value}
          explanation="Replace the old secret wherever your app keeps it. The old one no longer works."
          onClose={() => setRevealedSecret(null)}
        />
      ) : null}
    </>
  )
}

function EditApp({ app, disabled }: { app: DeveloperApp; disabled: boolean }) {
  const [values, setValues] = useState<AppFieldValues>(() => toValues(app))
  const [errors, setErrors] = useState<AppFieldErrors>({})
  const [saved, setSaved] = useState(false)
  const update = useUpdateApp()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    const checked = appFieldsValid(values)
    setErrors(checked.errors)
    if (!checked.input) return
    update.mutate({ id: app.id, ...checked.input }, { onSuccess: () => setSaved(true) })
  }

  return (
    <form className={styles.formGrid} onSubmit={submit} noValidate>
      <AppFields
        values={values}
        errors={errors}
        onChange={setValues}
        idPrefix="edit"
        disabled={disabled}
      />
      {update.isError ? (
        <Callout variant="danger" title="The changes were not saved">
          {update.error.detail ?? update.error.title}
        </Callout>
      ) : null}
      <div className={styles.row}>
        <Button type="submit" disabled={disabled} loading={update.isPending}>
          Save changes
        </Button>
        {saved ? (
          <span role="status" className={styles.muted}>
            Saved.
          </span>
        ) : null}
      </div>
    </form>
  )
}

function toValues(app: DeveloperApp): AppFieldValues {
  return {
    name: app.name,
    description: app.description,
    redirectText: app.redirectUris.join('\n'),
  }
}
