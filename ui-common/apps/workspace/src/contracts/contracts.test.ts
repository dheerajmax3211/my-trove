/**
 * Demo-mode contract suite: every product's in-memory mock API (what `?demo=1` answers from) must return the same
 * shapes as the real services. Both sides validate against the same files in `/contracts` at the repo root; the
 * service half lives in each service's `*ContractTest`.
 */
import type { ProductModule } from '@platform/workspace-kit'
import { describe, expect, it } from 'vitest'
import { productModule as waitingOn } from '@platform/waiting-on/module'
import { validate, type Schema } from './validate'

const files = import.meta.glob<Schema>('../../../../../contracts/*/*.schema.json', {
  eager: true,
  import: 'default',
})

/** Contract files of one service folder, keyed by file name. */
function folder(service: string): Map<string, Schema> {
  const map = new Map<string, Schema>()
  for (const [path, schema] of Object.entries(files)) {
    const match = /\/contracts\/([^/]+)\/([^/]+)$/.exec(path)
    if (match && match[1] === service) map.set(match[2] ?? '', schema)
  }
  return map
}

const API = 'http://localhost/api'

/** Calls a module's demo API the way the workspace does (`${apiBase}/${service}`) and returns the JSON body. */
function client(module: ProductModule) {
  const demoFetch = module.createDemoFetch?.()
  if (!demoFetch) throw new Error(`${module.id} has no demo API`)
  return async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const response = await demoFetch(`${API}/${module.service}${path}`, {
      method,
      headers: {
        authorization: 'Bearer demo',
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`)
    return JSON.parse(text) as unknown
  }
}

/** Validates and, for lists, refuses an empty array: an empty list would prove nothing about the element shape. */
function expectContract(service: string, file: string, body: unknown) {
  if (Array.isArray(body)) expect(body.length, `${file}: empty list proves nothing`).toBeGreaterThan(0)
  expect(validate(folder(service), file, body)).toEqual([])
}

describe('every contract file is used and well formed', () => {
  it('finds the contract folders', () => {
    expect(Object.keys(files).length).toBeGreaterThan(0)
  })
})

describe('waiting-on demo API', () => {
  const call = client(waitingOn)

  it('GET /v1/items (home, Today) and each item', async () => {
    const items = (await call('GET', '/v1/items')) as { id: string; status: string }[]
    expectContract('waiting-on', 'item-list.schema.json', items)
    const closed = await call('GET', '/v1/items?status=RESOLVED&status=EXPIRED&status=CANCELLED')
    expectContract('waiting-on', 'item-list.schema.json', closed)
    const first = items[0]!
    expectContract('waiting-on', 'item.schema.json', await call('GET', `/v1/items/${first.id}`))
    expectContract('waiting-on', 'timeline.schema.json', await call('GET', `/v1/items/${first.id}/timeline`))
    expectContract(
      'waiting-on',
      'draft.schema.json',
      await call('GET', `/v1/items/${first.id}/draft?tone=ESCALATION`),
    )
  })

  it('POST /v1/items, snooze and resolve return an item', async () => {
    const created = (await call('POST', '/v1/items', {
      title: 'Contract check refund',
      counterparty: 'Shop Ltd',
      category: 'REFUND',
      amount: 12.5,
      currency: 'GBP',
      expectedBy: '2030-01-01',
    })) as { id: string }
    expectContract('waiting-on', 'item.schema.json', created)
    expectContract(
      'waiting-on',
      'item.schema.json',
      await call('POST', `/v1/items/${created.id}/snooze`, { days: 3 }),
    )
    expectContract(
      'waiting-on',
      'item.schema.json',
      await call('POST', `/v1/items/${created.id}/resolve`, { outcome: 'Paid' }),
    )
  })
})
