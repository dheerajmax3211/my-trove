import type { AlertDto, AlertKind, AlertStatus, Severity } from '../features/alerts/types'
import type {
  Appliance,
  ApplianceHealth,
  Baseline,
  HealthStatus,
  ServiceInfo,
} from '../features/appliances/types'
import type { DeviceDto } from '../features/devices/types'
import type { ReadingSeries, ReadingSource, Resolution } from '../features/readings/types'
import type { Clock } from '../lib/clock'
import { computeReminders, daysBetween } from './reminders'
import { demoSeed, emptySeed, TYPE_SIGNALS } from './seed'
import { bucketMs, hasData, lastSeen, seriesFor, wattsAt, type SignalProfile } from './signal'
import type { StoredAlert, StoredAppliance, StoredDevice } from './types'
import { json, noContent, problem } from './problem'
import {
  importCsv,
  manualLast24h,
  manualSeries,
  ManualConflict,
  parseCsv,
  recordMeterTotal,
  type ManualState,
} from './manual'
import { BadRequest, parseApplianceBody, parseLabel } from './validation'

const MIN = 60_000
const DAY = 24 * 60 * MIN
const LEARN_DAYS = 7
const MAX_POINTS = 5000

export interface MockApiOptions {
  clock: Clock
  /** Artificial delay per request so loading states are visible in the demo. Default 0. */
  latencyMs?: number
  /** `demo` (default): four sample appliances. `empty`: a brand new account. */
  seed?: 'demo' | 'empty'
}

export interface MockApi {
  fetch: typeof fetch
  /** Direct access for tests: add the kind of alert the evaluation job would raise. */
  addAlert: (alert: {
    applianceId: string
    kind: AlertKind
    severity: Severity
    message: string
    evidence: Record<string, unknown>
    status?: AlertStatus
    decidedBy?: 'MAD' | 'ML'
  }) => string
  appliances: () => readonly StoredAppliance[]
  /** Makes the next request that matches `method path` fail with this status, once. */
  failNext: (match: string, status: number, detail?: string) => void
}

class NotFound extends Error {}
class Conflict extends Error {}

function chooseResolution(rangeMs: number): Resolution {
  if (rangeMs <= 60 * MIN) return 'RAW'
  if (rangeMs <= 2 * DAY) return 'ONE_MINUTE'
  if (rangeMs <= 60 * DAY) return 'ONE_HOUR'
  return 'ONE_DAY'
}

const RESOLUTIONS: readonly string[] = ['RAW', 'ONE_MINUTE', 'ONE_HOUR', 'ONE_DAY']
const STATUSES: readonly string[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * An in-memory stand-in for the home-pulse service: the same paths, status codes, problem+json bodies and
 * validation rules as the owner API, with a synthetic (but deterministic) power signal behind the readings.
 * It is the whole backend in demo mode, and the backend of every UI test.
 */
export function createMockApi(options: MockApiOptions): MockApi {
  const { clock, latencyMs = 0 } = options
  const seed = options.seed === 'empty' ? emptySeed() : demoSeed(clock)
  const appliances = [...seed.appliances]
  const devices = [...seed.devices]
  const alerts = [...seed.alerts]
  const relearnedAt = new Map<string, number>()
  const failures = new Map<string, { status: number; detail: string }>()
  let counter = 1000

  const nextId = (): string => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`
  const nowMs = () => clock().getTime()
  const nowIso = () => clock().toISOString()
  const today = () => clock().toISOString().slice(0, 10)

  // ---- views -------------------------------------------------------------------------------------------

  const warrantyOf = (a: StoredAppliance) => {
    const t = today()
    return {
      underWarranty: a.warrantyEndDate !== null && a.warrantyEndDate >= t,
      daysToWarrantyEnd: a.warrantyEndDate ? daysBetween(t, a.warrantyEndDate) : null,
      serviceOverdue: a.nextServiceDate !== null && a.nextServiceDate < t,
      daysToNextService: a.nextServiceDate ? daysBetween(t, a.nextServiceDate) : null,
    }
  }

  const applianceView = (a: StoredAppliance): Appliance => ({ ...a, ...warrantyOf(a) })

  /** Mirrors ReadingSource: which kind of device the numbers come from. */
  const sourceOf = (d: StoredDevice | null | undefined): ReadingSource | null =>
    !d ? null : d.simulated ? 'SIMULATED' : d.manual ? 'MANUAL' : 'DEVICE'

  const lastSeenOf = (d: StoredDevice, now: number): number | null => {
    if (d.manual) {
      const last = d.manual.samples[d.manual.samples.length - 1]
      return last ? last.ms : null
    }
    return lastSeen(d.profile, now)
  }

  const deviceView = (d: StoredDevice): DeviceDto => ({
    id: d.id,
    applianceId: d.applianceId,
    label: d.label,
    // A manual device has no token; the placeholder is never a credential.
    tokenPrefix: d.manual ? 'manual' : d.token.slice(0, 10),
    createdAt: d.createdAt,
    lastSeenAt: ((t) => (t === null ? null : new Date(t).toISOString()))(lastSeenOf(d, nowMs())),
    revokedAt: d.revokedAt,
    active: d.revokedAt === null,
    simulated: d.simulated === true,
    manual: d.manual !== undefined,
  })

  /** The live manual device of an appliance, created on the first entry. Refuses while a plug or the simulator runs. */
  const manualDeviceFor = (a: StoredAppliance): StoredDevice => {
    const live = activeDevice(a.id)
    if (live && live.manual) return live
    if (live && live.simulated)
      throw new Conflict(
        'This appliance runs on the simulator. Remove the simulation before entering readings by hand',
      )
    if (live)
      throw new Conflict(
        'This appliance has a live smart plug. Revoke the plug before entering readings by hand',
      )
    const device: StoredDevice = {
      id: nextId(),
      applianceId: a.id,
      label: 'Entered by you',
      token: '',
      createdAt: nowIso(),
      revokedAt: null,
      profile: {
        seed: counter,
        ...TYPE_SIGNALS[a.type],
        dataFrom: nowMs(),
        dataTo: nowMs(),
        outages: [],
      },
      manual: { samples: [], totals: [] },
    }
    devices.push(device)
    return device
  }

  const alertView = (a: StoredAlert): AlertDto => {
    const owner = appliances.find((x) => x.id === a.applianceId)
    if (!owner) throw new NotFound('Appliance not found')
    const w = warrantyOf(owner)
    return {
      ...a,
      applianceName: owner.name,
      decidedBy: a.decidedBy ?? 'MAD',
      underWarranty: w.underWarranty,
      warrantyEndDate: owner.warrantyEndDate,
      daysToWarrantyEnd: w.daysToWarrantyEnd,
      lastServiceDate: owner.lastServiceDate,
      nextServiceDate: owner.nextServiceDate,
      serviceOverdue: w.serviceOverdue,
      // The service always sends the flag; stored seed alerts leave it out when false.
      simulated: a.simulated === true,
    }
  }

  const find = (id: string): StoredAppliance => {
    const a = UUID.test(id) ? appliances.find((x) => x.id === id) : undefined
    if (!a) throw new NotFound('Appliance not found')
    return a
  }

  const activeDevice = (applianceId: string) =>
    devices.find((d) => d.applianceId === applianceId && d.revokedAt === null)

  const liveAlerts = (applianceId?: string) =>
    alerts.filter((a) => a.status !== 'RESOLVED' && (!applianceId || a.applianceId === applianceId))

  // ---- health ------------------------------------------------------------------------------------------

  const baselineFor = (device: StoredDevice): Baseline => {
    const p = device.profile
    const learnedFrom = Math.max(
      device.learnFromMs ?? Date.parse(device.createdAt),
      relearnedAt.get(device.applianceId) ?? 0,
    )
    return {
      standbyWatts: p.standbyWatts,
      peakWatts: Math.round(p.onWatts * 1.04),
      onThresholdWatts: Math.round((p.standbyWatts + p.onWatts) / 2),
      switching: true,
      onLevelMedian: p.onWatts,
      onLevelSpread: Math.round(p.onWatts * p.noise * 10) / 10,
      dutyMedian: p.duty,
      dutySpread: 0.02,
      cycleMinutesMedian: p.periodMin * p.duty,
      cycleMinutesSpread: 1,
      maxOnRunMinutes: Math.round(p.periodMin * p.duty * 1.3),
      maxOffRunMinutes: Math.round(p.periodMin * (1 - p.duty) * 1.3),
      windowsUsed: LEARN_DAYS * 4,
      learnedFrom: new Date(learnedFrom).toISOString(),
      learnedTo: new Date(learnedFrom + LEARN_DAYS * DAY).toISOString(),
    }
  }

  const health = (a: StoredAppliance): ApplianceHealth => {
    const now = nowMs()
    const device = activeDevice(a.id)
    const live = liveAlerts(a.id).map(alertView)
    // The demo does not learn a baseline from entered readings: a manual device stays in LEARNING.
    const learnedSince =
      device && !device.manual
        ? Math.max(device.learnFromMs ?? Date.parse(device.createdAt), relearnedAt.get(a.id) ?? 0)
        : null
    const ready = learnedSince !== null && now - learnedSince >= LEARN_DAYS * DAY
    const baseline = device && !device.manual && ready ? baselineFor(device) : null

    let last24h: ApplianceHealth['last24h'] = null
    if (device?.manual) {
      last24h = manualLast24h(device.manual.samples, now)
    } else if (device) {
      let sum = 0
      let max = 0
      let on = 0
      let count = 0
      const minute = Math.floor(now / MIN) * MIN
      for (let m = 0; m < 1440; m += 1) {
        const t = minute - m * MIN
        if (!hasData(device.profile, t, now)) continue
        const w = wattsAt(device.profile, t)
        sum += w
        max = Math.max(max, w)
        if (baseline && w >= baseline.onThresholdWatts) on += 1
        count += 1
      }
      const r1 = (n: number) => Math.round(n * 10) / 10
      last24h =
        count === 0
          ? { avgWatts: 0, maxWatts: 0, energyKwh: 0, dutyPct: null, minutesWithData: 0 }
          : {
              avgWatts: r1(sum / count),
              maxWatts: r1(max),
              energyKwh: Math.round((sum / 60 / 1000) * 1000) / 1000,
              dutyPct: baseline ? r1((100 * on) / count) : null,
              minutesWithData: count,
            }
    }

    let status: HealthStatus
    if (live.some((x) => x.severity === 'CRITICAL')) status = 'CRITICAL'
    else if (live.length > 0) status = 'WARNING'
    else if (!device) status = 'NO_DEVICE'
    else if (!baseline) status = 'LEARNING'
    else status = 'HEALTHY'

    const w = warrantyOf(a)
    const service: ServiceInfo = {
      underWarranty: w.underWarranty,
      warrantyEndDate: a.warrantyEndDate,
      daysToWarrantyEnd: w.daysToWarrantyEnd,
      lastServiceDate: a.lastServiceDate,
      nextServiceDate: a.nextServiceDate,
      serviceOverdue: w.serviceOverdue,
      daysToNextService: w.daysToNextService,
    }
    const seen = device ? lastSeenOf(device, now) : null
    return {
      applianceId: a.id,
      name: a.name,
      status,
      baselineStatus: !device ? 'NONE' : baseline ? 'READY' : 'LEARNING',
      baselineLearnedAt: baseline ? baseline.learnedTo : null,
      baseline,
      lastReadingAt: seen === null ? null : new Date(seen).toISOString(),
      last24h,
      activeAlerts: live,
      service,
      simulated: device?.simulated === true,
      source: sourceOf(device),
    }
  }

  // ---- readings ----------------------------------------------------------------------------------------

  const readings = (a: StoredAppliance, query: URLSearchParams): Response => {
    const end = query.get('to') ? Date.parse(query.get('to') as string) : nowMs()
    const start = query.get('from') ? Date.parse(query.get('from') as string) : end - DAY
    if (Number.isNaN(start) || Number.isNaN(end))
      throw new BadRequest('Failed to convert request parameter')
    if (start >= end) throw new BadRequest('from must be before to')
    const range = end - start
    if (range > 400 * DAY) throw new BadRequest('range too large (max 400 days)')
    const requested = query.get('resolution')
    if (requested !== null && !RESOLUTIONS.includes(requested))
      throw new BadRequest('Failed to convert request parameter')
    const resolution = (requested as Resolution | null) ?? chooseResolution(range)
    if (Math.floor(range / bucketMs(resolution)) + 1 > MAX_POINTS)
      throw new BadRequest(
        `range would return more than ${MAX_POINTS} points at resolution ${resolution}; use a coarser resolution or a shorter range`,
      )
    // Never mix sources (mirrors ReadingsService): a running simulation answers with its own readings only; otherwise
    // the real and manual history of the appliance. Newest device wins where two devices overlap (a replaced sensor).
    const live = activeDevice(a.id)
    const simulatedRun = live?.simulated === true
    const merged = new Map<string, ReadingSeries['points'][number]>()
    const owned = devices
      .filter(
        (d) =>
          d.applianceId === a.id &&
          (simulatedRun ? d.simulated === true && d.revokedAt === null : d.simulated !== true),
      )
      .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
    for (const d of owned) {
      const pts = d.manual
        ? manualSeries(d.manual.samples, start, end, resolution)
        : seriesFor(d.profile, start, end, resolution, nowMs())
      for (const p of pts) merged.set(p.ts, p)
    }
    const points = [...merged.values()].sort((x, y) => x.ts.localeCompare(y.ts))
    const body: ReadingSeries = {
      applianceId: a.id,
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString(),
      resolution,
      points,
      source: sourceOf(live),
      simulated: simulatedRun,
    }
    return json(body)
  }

  // ---- simulation --------------------------------------------------------------------------------------

  /** Mirrors `POST /v1/appliances/{id}/simulation`: five-minute readings, a learned baseline, and for ANOMALY a spike. */
  const simulate = (a: StoredAppliance, raw: unknown): Response => {
    const body = (raw ?? {}) as { days?: unknown; scenario?: unknown }
    const days = body.days === undefined ? 7 : body.days
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 14)
      throw new BadRequest('days must be between 1 and 14')
    const scenario = body.scenario === undefined ? 'NORMAL' : body.scenario
    if (scenario !== 'NORMAL' && scenario !== 'ANOMALY')
      throw new BadRequest('scenario must be NORMAL or ANOMALY')

    const real = devices.find(
      (d) => d.applianceId === a.id && d.revokedAt === null && d.simulated !== true,
    )
    if (real)
      throw new Conflict(
        'This appliance already has a real device; revoke it before using the simulator',
      )

    const now = nowMs()
    let device = devices.find((d) => d.applianceId === a.id && d.simulated === true)
    if (!device) {
      device = {
        id: nextId(),
        applianceId: a.id,
        label: 'Built-in simulator',
        token: `hpd_${nextId().replace(/-/g, '')}${nextId().replace(/-/g, '')}`.slice(0, 47),
        createdAt: nowIso(),
        revokedAt: null,
        simulated: true,
        profile: {
          seed: counter,
          ...TYPE_SIGNALS[a.type],
          dataFrom: now,
          dataTo: null,
          outages: [],
        },
      }
      devices.push(device)
    }
    device.profile = {
      ...device.profile,
      dataFrom: now - days * DAY,
      ...(scenario === 'ANOMALY' ? { stuckOnSince: now - 3 * 60 * MIN } : {}),
    }
    if (scenario === 'NORMAL') delete device.profile.stuckOnSince
    device.learnFromMs = now - days * DAY

    const ready = days >= LEARN_DAYS
    let alertOpened = false
    if (scenario === 'ANOMALY' && ready) {
      const open = alerts.some(
        (x) => x.applianceId === a.id && x.kind === 'STUCK_ON' && x.status !== 'RESOLVED',
      )
      if (!open) {
        alerts.push({
          id: nextId(),
          applianceId: a.id,
          kind: 'STUCK_ON',
          severity: 'CRITICAL',
          status: 'OPEN',
          message: 'Has been running non-stop for 3 h; the longest normal run is much shorter.',
          evidence: {
            runMinutes: 180,
            limitMinutes: 60,
            longestNormalRunMinutes: Math.round(
              TYPE_SIGNALS[a.type].periodMin * TYPE_SIGNALS[a.type].duty * 1.3,
            ),
            since: new Date(now - 3 * 60 * MIN).toISOString(),
          },
          openedAt: nowIso(),
          updatedAt: nowIso(),
          acknowledgedAt: null,
          resolvedAt: null,
          simulated: true,
        })
      }
      alertOpened = true
    }
    if (scenario === 'NORMAL')
      for (const alert of alerts)
        if (alert.simulated === true && alert.applianceId === a.id && alert.status !== 'RESOLVED') {
          alert.status = 'RESOLVED'
          alert.resolvedAt = nowIso()
          alert.updatedAt = nowIso()
        }
    return json({
      readingsInserted: days * 288,
      baselineStatus: ready ? 'READY' : 'LEARNING',
      alertOpened,
    })
  }

  // ---- routing -----------------------------------------------------------------------------------------

  const readBody = (init?: RequestInit): unknown => {
    if (typeof init?.body !== 'string' || init.body === '')
      throw new BadRequest('Failed to read request')
    try {
      return JSON.parse(init.body) as unknown
    } catch {
      throw new BadRequest('Failed to read request')
    }
  }

  const route = (
    method: string,
    path: string,
    query: URLSearchParams,
    init?: RequestInit,
  ): Response => {
    let m: RegExpExecArray | null

    if (path === '/v1/appliances') {
      if (method === 'GET')
        return json([...appliances].sort((x, y) => x.name.localeCompare(y.name)).map(applianceView))
      if (method === 'POST') {
        const b = parseApplianceBody(readBody(init))
        const created: StoredAppliance = {
          id: nextId(),
          ...b,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        appliances.push(created)
        return json(applianceView(created), 201)
      }
    }

    if ((m = /^\/v1\/appliances\/([^/]+)$/.exec(path))) {
      const a = find(m[1] as string)
      if (method === 'GET') return json(applianceView(a))
      if (method === 'PUT') {
        Object.assign(a, parseApplianceBody(readBody(init)), { updatedAt: nowIso() })
        return json(applianceView(a))
      }
      if (method === 'DELETE') {
        appliances.splice(appliances.indexOf(a), 1)
        for (const list of [devices, alerts])
          for (let i = list.length - 1; i >= 0; i -= 1)
            if ((list[i] as { applianceId: string }).applianceId === a.id) list.splice(i, 1)
        return noContent()
      }
    }

    if ((m = /^\/v1\/appliances\/([^/]+)\/devices$/.exec(path))) {
      const a = find(m[1] as string)
      if (method === 'GET')
        return json(
          devices
            .filter((d) => d.applianceId === a.id)
            .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
            .map(deviceView),
        )
      if (method === 'POST') {
        const label = parseLabel(readBody(init))
        if (activeDevice(a.id))
          throw new Conflict(
            'Appliance already has an active device; revoke it first to rotate the token',
          )
        const token = `hpd_${nextId().replace(/-/g, '')}${nextId().replace(/-/g, '')}`.slice(0, 47)
        const now = nowMs()
        const shape = TYPE_SIGNALS[a.type]
        const profile: SignalProfile = {
          seed: counter,
          ...shape,
          // The mock pretends the plug has been logging for a week, so a new device charts immediately.
          dataFrom: now - 7 * DAY,
          dataTo: null,
          outages: [],
        }
        const device: StoredDevice = {
          id: nextId(),
          applianceId: a.id,
          label,
          token,
          createdAt: nowIso(),
          revokedAt: null,
          profile,
        }
        devices.push(device)
        return json({ device: deviceView(device), ingestionToken: token }, 201)
      }
    }

    // Readings entered by hand (mirrors ManualReadingsController).
    if ((m = /^\/v1\/appliances\/([^/]+)\/meter-readings$/.exec(path)) && method === 'POST') {
      const a = find(m[1] as string)
      const body = (readBody(init) ?? {}) as { kwh?: unknown; at?: unknown }
      if (typeof body.kwh !== 'number' || !Number.isFinite(body.kwh) || body.kwh < 0)
        throw new BadRequest('kwh must be a number of 0 or more')
      let atMs: number | undefined
      if (body.at !== undefined) {
        atMs = typeof body.at === 'string' ? Date.parse(body.at) : Number.NaN
        if (Number.isNaN(atMs)) throw new BadRequest('at must be an ISO 8601 instant')
      }
      const device = manualDeviceFor(a)
      return json(recordMeterTotal(device.manual as ManualState, { kwh: body.kwh, atMs }, nowMs()))
    }

    if ((m = /^\/v1\/appliances\/([^/]+)\/readings\/import$/.exec(path)) && method === 'POST') {
      const a = find(m[1] as string)
      const body = (readBody(init) ?? {}) as { csv?: unknown }
      if (typeof body.csv !== 'string' || body.csv.trim() === '')
        throw new BadRequest('csv must not be blank')
      // Validate before the device exists, so a refused file creates nothing (as the service does).
      parseCsv(body.csv)
      const device = manualDeviceFor(a)
      return json(importCsv(device.manual as ManualState, body.csv, nowMs()))
    }

    if ((m = /^\/v1\/appliances\/([^/]+)\/simulation$/.exec(path))) {
      const a = find(m[1] as string)
      if (method === 'POST') return simulate(a, readBody(init))
      if (method === 'DELETE') {
        const sim = devices.find((d) => d.applianceId === a.id && d.simulated === true)
        const index = sim ? devices.indexOf(sim) : -1
        if (index >= 0) devices.splice(index, 1)
        for (const alert of alerts)
          if (
            alert.simulated === true &&
            alert.applianceId === a.id &&
            alert.status !== 'RESOLVED'
          ) {
            alert.status = 'RESOLVED'
            alert.resolvedAt = nowIso()
            alert.updatedAt = nowIso()
          }
        return noContent()
      }
    }

    if ((m = /^\/v1\/devices\/([^/]+)$/.exec(path)) && method === 'DELETE') {
      const d = devices.find((x) => x.id === m?.[1])
      if (!d) throw new NotFound('Device not found')
      if (d.revokedAt === null) {
        d.revokedAt = nowIso()
        d.profile = { ...d.profile, dataTo: nowMs() }
      }
      return noContent()
    }

    if ((m = /^\/v1\/appliances\/([^/]+)\/readings$/.exec(path)) && method === 'GET')
      return readings(find(m[1] as string), query)

    if ((m = /^\/v1\/appliances\/([^/]+)\/health$/.exec(path)) && method === 'GET')
      return json(health(find(m[1] as string)))

    if ((m = /^\/v1\/appliances\/([^/]+)\/baseline\/relearn$/.exec(path)) && method === 'POST') {
      const a = find(m[1] as string)
      relearnedAt.set(a.id, nowMs())
      for (const alert of liveAlerts(a.id))
        if (alert.kind !== 'NO_DATA') {
          alert.status = 'RESOLVED'
          alert.resolvedAt = nowIso()
          alert.updatedAt = nowIso()
        }
      return noContent(202)
    }

    if (path === '/v1/alerts' && method === 'GET') {
      const status = query.get('status')
      if (status !== null && !STATUSES.includes(status))
        throw new BadRequest('Failed to convert request parameter')
      const applianceId = query.get('applianceId')
      const includeResolved = query.get('includeResolved') === 'true'
      const limit = Math.min(Math.max(Number(query.get('limit') ?? 100) || 100, 1), 500)
      const list = alerts
        .filter((a) => (status ? a.status === status : includeResolved || a.status !== 'RESOLVED'))
        .filter((a) => !applianceId || a.applianceId === applianceId)
        .sort((x, y) => y.openedAt.localeCompare(x.openedAt) || x.id.localeCompare(y.id))
        .slice(0, limit)
      return json(list.map(alertView))
    }

    if ((m = /^\/v1\/alerts\/([^/]+)$/.exec(path)) && method === 'GET') {
      const a = alerts.find((x) => x.id === m?.[1])
      if (!a) throw new NotFound('Alert not found')
      return json(alertView(a))
    }

    if ((m = /^\/v1\/alerts\/([^/]+)\/ack$/.exec(path)) && method === 'POST') {
      const a = alerts.find((x) => x.id === m?.[1])
      if (!a) throw new NotFound('Alert not found')
      if (a.status === 'RESOLVED') throw new Conflict('Alert is already resolved')
      if (a.status === 'OPEN') {
        a.status = 'ACKNOWLEDGED'
        a.acknowledgedAt = nowIso()
        a.updatedAt = nowIso()
      }
      return json(alertView(a))
    }

    if (path === '/v1/reminders' && method === 'GET') {
      const days = Number(query.get('days') ?? 60)
      if (!Number.isInteger(days) || days < 0 || days > 365)
        throw new BadRequest('days must be between 0 and 365')
      const alerting = new Set(liveAlerts().map((a) => a.applianceId))
      return json(computeReminders(appliances, alerting, today(), days))
    }

    return problem(404, `No static resource ${path.replace(/^\//, '')}.`, path)
  }

  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      window.location.origin,
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    // Tests use the base `/api`; in the workspace it is `<gateway>/api/home-pulse`. Both end in `/v1/...`.
    const path = /\/v1(\/.*)?$/.test(url.pathname)
      ? url.pathname.slice(url.pathname.indexOf('/v1'))
      : url.pathname.replace(/^\/api/, '')
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs))
    else await Promise.resolve()

    const token = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '')
    if (!token || token.endsWith('-expired')) return problem(401, 'Missing or invalid token', path)

    const injected = failures.get(`${method} ${path}`)
    if (injected) {
      failures.delete(`${method} ${path}`)
      return problem(injected.status, injected.detail, path)
    }

    try {
      return route(method, path, url.searchParams, init)
    } catch (error) {
      if (error instanceof NotFound) return problem(404, error.message, path)
      if (error instanceof Conflict || error instanceof ManualConflict)
        return problem(409, error.message, path)
      if (error instanceof BadRequest) return problem(400, error.message, path)
      throw error
    }
  }

  return {
    fetch: handler,
    addAlert: (alert) => {
      find(alert.applianceId)
      const id = nextId()
      const status = alert.status ?? 'OPEN'
      alerts.push({
        id,
        applianceId: alert.applianceId,
        kind: alert.kind,
        severity: alert.severity,
        status,
        message: alert.message,
        evidence: alert.evidence,
        openedAt: nowIso(),
        updatedAt: nowIso(),
        acknowledgedAt: status === 'ACKNOWLEDGED' ? nowIso() : null,
        resolvedAt: status === 'RESOLVED' ? nowIso() : null,
        decidedBy: alert.decidedBy,
      })
      return id
    },
    appliances: () => appliances,
    failNext: (match, status, detail = 'Injected failure') => {
      failures.set(match, { status, detail })
    },
  }
}
