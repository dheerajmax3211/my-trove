import { MockBackend } from './mock/backend'

/** `http://gateway/api/digital-legacy/v1/legacy/vault/state` becomes `/v1/legacy/vault/state`, which the mock routes. */
function toServicePath(input: Parameters<typeof fetch>[0]): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(raw, 'http://localhost')
  const at = url.pathname.indexOf('/v1/')
  const path = at >= 0 ? url.pathname.slice(at) : url.pathname
  return `${path}${url.search}`
}

/**
 * An in-memory Digital Legacy server for the workspace's demo mode. It never touches the network. Each
 * call makes a fresh backend, so one demo session never sees another's vault. The same mock also backs
 * the standalone app's demo mode and every test.
 */
export function createDemoFetch(): typeof fetch {
  const mock = new MockBackend()
  return (input, init) => mock.fetch(toServicePath(input), init)
}
