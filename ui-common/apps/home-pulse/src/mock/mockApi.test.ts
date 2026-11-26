import { createApiClient, type ApiError } from '@platform/api-client'
import { describe, expect, it } from 'vitest'
import { alertsApi } from '../features/alerts/api'
import { appliancesApi } from '../features/appliances/api'
import { devicesApi } from '../features/devices/api'
import { readingsApi } from '../features/readings/api'
import { remindersApi } from '../features/reminders/api'
import { createMockApi } from './mockApi'

const NOW = new Date('2026-11-19T12:00:00.000Z')
const HOUR = 3_600_000
const FRIDGE = '00000000-0000-4000-8000-000000000001'
const PUMP = '00000000-0000-4000-8000-000000000003'
const WASHER = '00000000-0000-4000-8000-000000000004'

function setup(seed: 'demo' | 'empty' = 'demo', token: string | null = 'tok') {
  const mock = createMockApi({ clock: () => new Date(NOW), seed })
  const client = createApiClient({ baseUrl: '/api', getToken: () => token, fetch: mock.fetch })
  return { mock, client }
}
const fail = async (promise: Promise<unknown>) =>
  (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as ApiError

describe('mock API contract', () => {
  it('rejects a request without a token with a 401 problem document', async () => {
    const { client } = setup('demo', null)
    const error = await fail(appliancesApi(client).list())
    expect(error.status).toBe(401)
    expect(error.title).toBe('Unauthorized')
  })

  it('lists appliances by name with the derived warranty and service fields', async () => {
    const { client } = setup()
    const list = await appliancesApi(client).list()
    expect(list.map((a) => a.name)).toEqual([
      'Garden water pump',
      'Kitchen fridge',
      'Living room AC',
      'Washing machine',
    ])
    const fridge = list.find((a) => a.id === FRIDGE)
    expect(fridge).toMatchObject({
      underWarranty: true,
      daysToWarrantyEnd: 85,
      serviceOverdue: false,
    })
    expect(list.find((a) => a.id === PUMP)).toMatchObject({
      underWarranty: false,
      serviceOverdue: true,
      daysToNextService: -12,
    })
  })

  it('creates with 201 semantics, validates like Spring and rejects bad dates', async () => {
    const { client } = setup('empty')
    const api = appliancesApi(client)
    const created = await api.create({ name: 'Freezer', type: 'FRIDGE', location: null })
    expect(created.id).toBeTruthy()
    expect((await api.list()).map((a) => a.name)).toEqual(['Freezer'])

    const blank = await fail(api.create({ name: ' ', type: 'FRIDGE' }))
    expect(blank).toMatchObject({ status: 400, detail: 'name must not be blank' })

    const both = await fail(api.create({ name: '', type: undefined as never }))
    expect(both.detail).toBe('name must not be blank; type must not be null')

    const long = await fail(api.create({ name: 'x'.repeat(121), type: 'FRIDGE' }))
    expect(long.detail).toBe('name size must be between 0 and 120')

    const order = await fail(
      api.create({
        name: 'a',
        type: 'FRIDGE',
        purchaseDate: '2026-05-01',
        warrantyEndDate: '2026-04-01',
      }),
    )
    expect(order.detail).toBe('warrantyEndDate must not be before purchaseDate')

    const nonsense = await fail(api.create({ name: 'a', type: 'TOASTER' as never }))
    expect(nonsense).toMatchObject({ status: 400, detail: 'Failed to read request' })
  })

  it('updates, deletes (204) and then answers 404 for the same id', async () => {
    const { client } = setup()
    const api = appliancesApi(client)
    const updated = await api.update(FRIDGE, {
      name: 'Big fridge',
      type: 'FRIDGE',
      warrantyEndDate: null,
    })
    expect(updated).toMatchObject({
      name: 'Big fridge',
      underWarranty: false,
      warrantyEndDate: null,
    })
    await api.remove(FRIDGE)
    expect((await fail(api.get(FRIDGE))).status).toBe(404)
    expect((await fail(api.remove(FRIDGE))).detail).toBe('Appliance not found')
    expect((await fail(api.get('not-a-uuid'))).status).toBe(404)
  })

  describe('devices', () => {
    it('shows the token once, lists no token, and allows only one active device per appliance', async () => {
      const { client } = setup()
      const api = devicesApi(client)
      const registered = await api.register(WASHER, 'Plug')
      expect(registered.ingestionToken).toMatch(/^hpd_[A-Za-z0-9]{20,}$/)
      expect(registered.device).toMatchObject({ label: 'Plug', active: true, revokedAt: null })

      const listed = await api.list(WASHER)
      expect(JSON.stringify(listed)).not.toContain(registered.ingestionToken)
      expect(listed[0]?.tokenPrefix).toBe(registered.ingestionToken.slice(0, 10))

      const again = await fail(api.register(WASHER, 'Second'))
      expect(again.status).toBe(409)
      expect(again.detail).toMatch(/revoke it first/)

      await api.revoke(registered.device.id)
      const afterRevoke = await api.list(WASHER)
      expect(afterRevoke[0]).toMatchObject({ active: false })
      expect(afterRevoke[0]?.revokedAt).toBe(NOW.toISOString())
      expect((await api.register(WASHER, 'Replacement')).device.active).toBe(true)
    })

    it('validates the label and the appliance, and 404s for an unknown device', async () => {
      const { client } = setup()
      const api = devicesApi(client)
      expect((await fail(api.register(WASHER, '  '))).detail).toBe('label must not be blank')
      expect((await fail(api.register('00000000-0000-4000-8000-0000000000ff', 'x'))).status).toBe(
        404,
      )
      expect((await fail(api.revoke('nope'))).detail).toBe('Device not found')
    })
  })

  describe('readings', () => {
    const series = (from: Date, to: Date, resolution?: 'RAW') =>
      readingsApi(setup().client).series(FRIDGE, {
        from,
        to,
        ...(resolution ? { resolution } : {}),
      })

    it('picks the resolution from the size of the range, like the service', async () => {
      const { client } = setup()
      const api = readingsApi(client)
      const at = (ms: number) => ({ from: new Date(NOW.getTime() - ms), to: NOW })
      expect((await api.series(FRIDGE, at(HOUR))).resolution).toBe('RAW')
      expect((await api.series(FRIDGE, at(24 * HOUR))).resolution).toBe('ONE_MINUTE')
      expect((await api.series(FRIDGE, at(7 * 24 * HOUR))).resolution).toBe('ONE_HOUR')
      expect((await api.series(FRIDGE, at(90 * 24 * HOUR))).resolution).toBe('ONE_DAY')
    })

    it('returns real buckets with avg, min and max, and leaves holes where the sensor was silent', async () => {
      const day = await series(new Date(NOW.getTime() - 24 * HOUR), NOW)
      expect(day.points.length).toBeGreaterThan(1000)
      for (const p of day.points) {
        expect(p.minWatts).toBeLessThanOrEqual(p.avgWatts)
        expect(p.maxWatts).toBeGreaterThanOrEqual(p.avgWatts)
      }
      // The seeded fridge has a 3 hour outage from 29 h to 26 h ago: no buckets in that window.
      const outageStart = NOW.getTime() - 29 * HOUR
      const outageEnd = NOW.getTime() - 26 * HOUR
      const inOutage = (
        await series(new Date(outageStart - HOUR), new Date(outageEnd + HOUR))
      ).points.filter((p) => {
        const t = Date.parse(p.ts)
        return t >= outageStart && t < outageEnd
      })
      expect(inOutage).toEqual([])
    })

    it('is deterministic: the same window gives the same numbers', async () => {
      const w = [new Date(NOW.getTime() - 6 * HOUR), NOW] as const
      expect(await series(...w)).toEqual(await series(...w))
    })

    it('gives an appliance without a device an empty series', async () => {
      const { client } = setup()
      const s = await readingsApi(client).series(WASHER, {
        from: new Date(NOW.getTime() - HOUR),
        to: NOW,
      })
      expect(s.points).toEqual([])
    })

    it('rejects impossible windows with 400', async () => {
      const { client } = setup()
      const api = readingsApi(client)
      expect((await fail(api.series(FRIDGE, { from: NOW, to: NOW }))).detail).toBe(
        'from must be before to',
      )
      const wide = await fail(
        api.series(FRIDGE, { from: new Date(NOW.getTime() - 401 * 24 * HOUR), to: NOW }),
      )
      expect(wide.detail).toBe('range too large (max 400 days)')
      const tooMany = await fail(
        api.series(FRIDGE, {
          from: new Date(NOW.getTime() - 24 * HOUR),
          to: NOW,
          resolution: 'RAW',
        }),
      )
      expect(tooMany.detail).toMatch(/more than 5000 points/)
    })
  })

  describe('health', () => {
    it('reports status from live alerts, then device and baseline state', async () => {
      const { client } = setup()
      const api = appliancesApi(client)
      expect((await api.health(PUMP)).status).toBe('CRITICAL')
      expect((await api.health(FRIDGE)).status).toBe('WARNING')
      expect((await api.health('00000000-0000-4000-8000-000000000002')).status).toBe('HEALTHY')
      expect((await api.health(WASHER)).status).toBe('NO_DEVICE')
    })

    it('goes to LEARNING for a new device and for a relearn, closing judged alerts', async () => {
      const { client } = setup()
      const api = appliancesApi(client)
      const devices = devicesApi(client)
      await devices.register(WASHER, 'Plug')
      expect((await api.health(WASHER)).status).toBe('LEARNING')

      await api.relearnBaseline(FRIDGE)
      const health = await api.health(FRIDGE)
      expect(health.status).toBe('LEARNING')
      expect(health.baseline).toBeNull()
      expect(health.activeAlerts).toEqual([])
    })

    it('carries the baseline, last 24 hours and service info', async () => {
      const { client } = setup()
      const h = await appliancesApi(client).health(FRIDGE)
      expect(h.baseline?.onLevelMedian).toBe(120)
      expect(h.last24h?.minutesWithData).toBeGreaterThan(1000)
      expect(h.last24h?.dutyPct).not.toBeNull()
      expect(h.service).toMatchObject({ underWarranty: true, daysToWarrantyEnd: 85 })
      expect(h.activeAlerts).toHaveLength(2)
    })
  })

  describe('alerts', () => {
    it('lists live alerts by default, newest first, with warranty context', async () => {
      const { client } = setup()
      const alerts = await alertsApi(client).list('ACTIVE')
      expect(alerts.map((a) => a.kind)).toEqual(['STUCK_ON', 'POWER_SHIFT', 'DUTY_CYCLE_DRIFT'])
      expect(alerts.every((a) => a.status !== 'RESOLVED')).toBe(true)
      const shift = alerts.find((a) => a.kind === 'POWER_SHIFT')
      expect(shift).toMatchObject({
        applianceName: 'Kitchen fridge',
        underWarranty: true,
        daysToWarrantyEnd: 85,
      })
      const opened = alerts.map((a) => a.openedAt)
      expect(opened).toEqual([...opened].sort().reverse())
    })

    it('filters by status, appliance and history', async () => {
      const { client } = setup()
      const api = alertsApi(client)
      expect((await api.list('OPEN')).map((a) => a.status)).toEqual(['OPEN', 'OPEN'])
      expect((await api.list('RESOLVED')).map((a) => a.kind)).toEqual(['NO_DATA'])
      expect(await api.list('ALL')).toHaveLength(4)
      expect((await api.list('ALL', PUMP)).every((a) => a.applianceId === PUMP)).toBe(true)
    })

    it('acknowledges an open alert, is idempotent, and refuses a resolved one with 409', async () => {
      const { client } = setup()
      const api = alertsApi(client)
      const [open] = await api.list('OPEN')
      const acked = await api.acknowledge(open?.id ?? '')
      expect(acked.status).toBe('ACKNOWLEDGED')
      expect(acked.acknowledgedAt).toBe(NOW.toISOString())
      expect((await api.acknowledge(acked.id)).status).toBe('ACKNOWLEDGED')
      const [resolved] = await api.list('RESOLVED')
      const conflict = await fail(api.acknowledge(resolved?.id ?? ''))
      expect(conflict).toMatchObject({ status: 409, detail: 'Alert is already resolved' })
      expect((await fail(api.acknowledge('missing'))).detail).toBe('Alert not found')
    })

    it('lets a test add the kind of alert the evaluation job raises', async () => {
      const { client, mock } = setup()
      const id = mock.addAlert({
        applianceId: '00000000-0000-4000-8000-000000000002',
        kind: 'POWER_SHIFT',
        severity: 'CRITICAL',
        message: 'm',
        evidence: { baselineWatts: 900, currentWatts: 1200, changePct: 33 },
      })
      expect((await alertsApi(client).list('OPEN')).map((a) => a.id)).toContain(id)
      expect(
        (await appliancesApi(client).health('00000000-0000-4000-8000-000000000002')).status,
      ).toBe('CRITICAL')
    })
  })

  describe('reminders', () => {
    it('follows the service rules and sorts the anomaly-while-under-warranty case first', async () => {
      const { client } = setup()
      const list = await remindersApi(client).list(60)
      expect(list.map((r) => `${r.applianceName}:${r.type}`)).toEqual([
        'Garden water pump:SERVICE_OVERDUE',
        'Kitchen fridge:SERVICE_DUE',
        'Kitchen fridge:WARRANTY_CLAIM_WINDOW',
        'Living room AC:SERVICE_DUE',
      ])
      expect(list[0]).toMatchObject({
        highPriority: true,
        daysUntil: -12,
        message: 'Service was due 12 day(s) ago and the appliance is showing an anomaly.',
      })
      expect(list[2]?.message).toContain('warranty is still valid (ends in 85 day(s))')
      expect(list[3]).toMatchObject({ highPriority: false, daysUntil: 20 })
    })

    it('limits to the horizon and validates it', async () => {
      const { client } = setup()
      const api = remindersApi(client)
      expect((await api.list(10)).map((r) => r.type)).not.toContain('SERVICE_DUE')
      expect((await fail(api.list(400))).detail).toBe('days must be between 0 and 365')
    })
  })

  it('answers unknown routes with a 404 problem', async () => {
    const { client } = setup()
    expect((await fail(client.get('/v1/nope'))).status).toBe(404)
  })

  it('can inject a one-off failure for error-state tests', async () => {
    const { client, mock } = setup()
    mock.failNext('GET /v1/appliances', 503)
    expect((await fail(appliancesApi(client).list())).status).toBe(503)
    expect(await appliancesApi(client).list()).toHaveLength(4)
  })
})
