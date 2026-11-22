import { Button, Callout, Field, Input, Select } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { useWorkspace } from '../workspace/context'
import { KEY_ROUTES, NOT_OPEN_TO_KEYS, lacksPermission } from './routes'
import { keyState } from './format'
import { useDeveloperApps, useKeysOfApps, useScopes } from './hooks'
import type { ApiKey, Scope } from './contract'
import styles from './Developer.module.css'

export interface PlaygroundResult {
  status: number
  statusText: string
  body: string
  ms: number
}

/** The permissions a key holds, from its scopes and the scope catalogue. */
export function permissionsOf(
  key: Pick<ApiKey, 'scopes'>,
  catalogue: readonly Scope[],
): Set<string> {
  const held = new Set<string>()
  for (const scope of catalogue) {
    if (key.scopes.includes(scope.name))
      scope.permissions.forEach((permission) => held.add(permission))
  }
  return held
}

/**
 * The playground sends one request through the gateway with a key you pick, so you can see what the key gets back.
 * It refuses, in the gateway's own words, what the key may not call, and it never sends your session token: the key
 * is the only credential. The key value is not stored; you paste it each time.
 */
export function Playground() {
  usePageTitle('Playground')
  const { runtime } = useWorkspace()
  const apps = useDeveloperApps()
  const keys = useKeysOfApps(apps.data ?? [])
  const catalogue = useScopes()
  const now = new Date()
  const usable = keys.keys.filter((key) => keyState(key, now) === 'Active')

  const [keyId, setKeyId] = useState('')
  const [value, setValue] = useState('')
  const [method, setMethod] = useState<'GET' | 'POST'>('GET')
  const [path, setPath] = useState('/platform/v1/usage/me')
  const [error, setError] = useState<string | undefined>()
  const [result, setResult] = useState<PlaygroundResult | null>(null)
  const [sending, setSending] = useState(false)

  const chosen = usable.find((key) => key.id === keyId)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setResult(null)
    setError(undefined)
    if (!chosen) return setError('Choose the key to send with.')
    if (!value.startsWith(chosen.keyPrefix)) {
      return setError(`This is not the key you chose. It starts with ${chosen.keyPrefix}.`)
    }
    const route = KEY_ROUTES.find(
      (candidate) => candidate.method === method && candidate.path === path.split('?')[0],
    )
    if (!route) return setError(NOT_OPEN_TO_KEYS)
    if (!permissionsOf(chosen, catalogue.data ?? []).has(route.permission)) {
      return setError(lacksPermission(route.permission))
    }

    setSending(true)
    try {
      setResult(
        await sendThrough(
          runtime.workspaceFetch ?? fetch,
          `${runtime.apiBase}${path}`,
          method,
          value,
        ),
      )
    } catch {
      setError('The request did not reach the gateway. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  if (apps.isPending || keys.pending) return <p className={styles.muted}>Loading your keys.</p>

  return (
    <div className={styles.stack}>
      <p className={styles.muted}>
        Send one request as a key. Only the routes listed under API docs are open to keys. Paste the
        full key you copied when you issued it. This page does not keep it.
      </p>
      {usable.length === 0 ? (
        <Callout variant="note" title="No active key">
          Issue a key on the API keys page, then come back here.
        </Callout>
      ) : (
        <form
          className={styles.formGrid}
          onSubmit={(event) => void submit(event)}
          noValidate
          aria-label="Send a request"
        >
          <Field label="Key" required controlId="pg-key">
            <Select value={keyId} onChange={(event) => setKeyId(event.target.value)}>
              <option value="">Choose a key</option>
              {usable.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.name} ({key.keyPrefix}…)
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Key value"
            required
            controlId="pg-value"
            description="The full value, for example pk_… copied when the key was issued."
          >
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          <div className={styles.row}>
            <Field label="Method" controlId="pg-method">
              <Select
                value={method}
                onChange={(event) => setMethod(event.target.value as 'GET' | 'POST')}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </Select>
            </Field>
            <Field label="Path" controlId="pg-path" description={`Relative to ${runtime.apiBase}`}>
              <Input value={path} onChange={(event) => setPath(event.target.value)} />
            </Field>
          </div>
          {error ? (
            <Callout variant="danger" title="Not sent">
              {error}
            </Callout>
          ) : null}
          <div className={styles.row}>
            <Button type="submit" loading={sending}>
              Send request
            </Button>
          </div>
        </form>
      )}

      {result ? (
        <section aria-labelledby="pg-result" className={styles.stack}>
          <h2 id="pg-result">
            Response {result.status}
            {result.statusText ? ` ${result.statusText}` : ''}
          </h2>
          <p className={styles.muted}>{result.ms} ms through the gateway</p>
          <pre className={styles.code} aria-label="Response body">
            {result.body}
          </pre>
        </section>
      ) : null}
    </div>
  )
}

/**
 * One request with the key as the only credential. It is never the signed-in user's token: this goes straight to the
 * transport, not through the workspace client.
 */
async function sendThrough(
  send: typeof fetch,
  url: string,
  method: 'GET' | 'POST',
  key: string,
): Promise<PlaygroundResult> {
  const started = performance.now()
  const response = await send(url, {
    method,
    headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
  })
  const text = await response.text()
  return {
    status: response.status,
    statusText: response.statusText,
    body: pretty(text),
    ms: Math.round(performance.now() - started),
  }
}

function pretty(text: string): string {
  if (text === '') return '(no body)'
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}
