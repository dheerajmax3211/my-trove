import { isApiError } from '@platform/api-client'
import { Badge, Button, Callout, Dialog, DialogClose, EmptyState } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { AppFields, appFieldsValid, type AppFieldErrors, type AppFieldValues } from './AppFields'
import { SecretReveal } from './SecretReveal'
import { useCreateApp, useDeveloperApps, type AppInput } from './hooks'
import { when } from './format'
import type { CreatedApp } from './contract'
import styles from './Developer.module.css'

const EMPTY: AppFieldValues = { name: '', description: '', redirectText: '' }

/** Every app the owner has, with the one action that makes a new one. */
export function Apps() {
  usePageTitle('Apps')
  const apps = useDeveloperApps()
  const [registering, setRegistering] = useState(false)
  const [revealed, setRevealed] = useState<CreatedApp | null>(null)
  const navigate = useNavigate()
  const list = apps.data ?? []

  return (
    <section aria-labelledby="apps-heading" className={styles.stack}>
      <div className={styles.row}>
        <h2 id="apps-heading">Apps</h2>
        <Button onClick={() => setRegistering(true)}>Register an app</Button>
      </div>
      <p className={styles.muted}>
        An app gets a client ID, a client secret and redirect addresses. Its API keys and webhooks
        belong to it.
      </p>

      {apps.isError ? (
        <Callout variant="danger" title="We could not load your apps">
          {isApiError(apps.error) ? apps.error.title : 'Check your connection and try again.'}
        </Callout>
      ) : apps.isPending ? (
        <p className={styles.muted}>Loading your apps.</p>
      ) : list.length === 0 ? (
        <EmptyState
          title="No apps yet"
          description="Register an app to get a client ID and keys for it."
          action={<Button onClick={() => setRegistering(true)}>Register an app</Button>}
        />
      ) : (
        <ul className={styles.list} aria-label="Your apps">
          {list.map((app) => (
            <li key={app.id} className={styles.listItem}>
              <div className={styles.stack}>
                <Link to={`/developer/apps/${app.id}`}>
                  <strong>{app.name}</strong>
                </Link>
                <span className={styles.mono}>{app.clientId}</span>
                <span className={styles.muted}>
                  {app.redirectUris.length} redirect{' '}
                  {app.redirectUris.length === 1 ? 'address' : 'addresses'} · created{' '}
                  {when(app.createdAt)}
                </span>
              </div>
              <Badge
                variant={app.revokedAt ? 'danger' : app.hasClientSecret ? 'success' : 'neutral'}
              >
                {app.revokedAt ? 'Deleted' : app.hasClientSecret ? 'Has a secret' : 'No secret yet'}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <RegisterApp
        open={registering}
        onOpenChange={setRegistering}
        onCreated={(created) => {
          setRegistering(false)
          setRevealed(created)
        }}
      />

      {revealed ? (
        <SecretReveal
          open
          title={`Client secret for ${revealed.name}`}
          label="Client secret"
          value={revealed.clientSecret}
          explanation="Your app sends this secret when it exchanges a code for a token. Keep it on your server, never in a browser or app you ship."
          onClose={() => {
            const id = revealed.id
            setRevealed(null)
            void navigate(`/developer/apps/${id}`)
          }}
        />
      ) : null}
    </section>
  )
}

function RegisterApp({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (created: CreatedApp) => void
}) {
  const [values, setValues] = useState<AppFieldValues>(EMPTY)
  const [errors, setErrors] = useState<AppFieldErrors>({})
  const create = useCreateApp()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = appFieldsValid(values)
    setErrors(checked.errors)
    if (!checked.input) return
    const input: AppInput = checked.input
    create.mutate(input, {
      onSuccess: (created) => {
        setValues(EMPTY)
        create.reset()
        onCreated(created)
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) create.reset()
        onOpenChange(next)
      }}
      title="Register an app"
      description="You will see the client secret once, on the next screen."
      dismissible={!create.isPending}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="register-app" loading={create.isPending}>
            Register app
          </Button>
        </>
      }
    >
      <form id="register-app" className={styles.formGrid} onSubmit={submit} noValidate>
        <AppFields values={values} errors={errors} onChange={setValues} idPrefix="register" />
        {create.isError ? (
          <Callout variant="danger" title="The app was not registered">
            {create.error.detail ?? create.error.title}
          </Callout>
        ) : null}
      </form>
    </Dialog>
  )
}
