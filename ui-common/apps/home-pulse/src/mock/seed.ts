import type { Clock } from '../lib/clock'
import type { SignalProfile } from './signal'
import type { StoredAlert, StoredAppliance, StoredDevice } from './types'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export interface SeedData {
  appliances: StoredAppliance[]
  devices: StoredDevice[]
  alerts: StoredAlert[]
}

/** Signal shape per appliance type, used for devices registered while the demo runs. */
export const TYPE_SIGNALS = {
  FRIDGE: { standbyWatts: 3, onWatts: 120, periodMin: 40, duty: 0.4, noise: 0.03 },
  AIR_CONDITIONER: { standbyWatts: 2, onWatts: 900, periodMin: 90, duty: 0.5, noise: 0.03 },
  WATER_PUMP: { standbyWatts: 1, onWatts: 700, periodMin: 120, duty: 0.1, noise: 0.04 },
  WASHING_MACHINE: { standbyWatts: 1, onWatts: 480, periodMin: 150, duty: 0.2, noise: 0.08 },
  OTHER: { standbyWatts: 2, onWatts: 200, periodMin: 60, duty: 0.5, noise: 0.05 },
} as const

const date = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const iso = (ms: number): string => new Date(ms).toISOString()

/** Four appliances that exercise every screen: a degrading fridge under warranty, a healthy AC, a pump stuck on, no device. */
export function demoSeed(clock: Clock): SeedData {
  const now = clock().getTime()
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

  const appliances: StoredAppliance[] = [
    {
      id: id(1),
      name: 'Kitchen fridge',
      type: 'FRIDGE',
      location: 'Kitchen',
      purchaseDate: date(now - 2 * 365 * DAY),
      warrantyEndDate: date(now + 85 * DAY),
      lastServiceDate: date(now - 300 * DAY),
      nextServiceDate: date(now + 40 * DAY),
      notes: 'Bought with a 3 year warranty. Door seal replaced once.',
      createdAt: iso(now - 60 * DAY),
      updatedAt: iso(now - 60 * DAY),
    },
    {
      id: id(2),
      name: 'Living room AC',
      type: 'AIR_CONDITIONER',
      location: 'Living room',
      purchaseDate: date(now - 4 * 365 * DAY),
      warrantyEndDate: date(now - 200 * DAY),
      lastServiceDate: date(now - 340 * DAY),
      nextServiceDate: date(now + 20 * DAY),
      notes: null,
      createdAt: iso(now - 90 * DAY),
      updatedAt: iso(now - 90 * DAY),
    },
    {
      id: id(3),
      name: 'Garden water pump',
      type: 'WATER_PUMP',
      location: 'Garden shed',
      purchaseDate: date(now - 3 * 365 * DAY),
      warrantyEndDate: date(now - 30 * DAY),
      lastServiceDate: date(now - 400 * DAY),
      nextServiceDate: date(now - 12 * DAY),
      notes: null,
      createdAt: iso(now - 50 * DAY),
      updatedAt: iso(now - 50 * DAY),
    },
    {
      id: id(4),
      name: 'Washing machine',
      type: 'WASHING_MACHINE',
      location: 'Laundry',
      purchaseDate: null,
      warrantyEndDate: null,
      lastServiceDate: null,
      nextServiceDate: null,
      notes: null,
      createdAt: iso(now - 10 * DAY),
      updatedAt: iso(now - 10 * DAY),
    },
  ]

  const profile = (
    seed: number,
    type: keyof typeof TYPE_SIGNALS,
    extra: Partial<SignalProfile> & { dataFrom: number },
  ): SignalProfile => ({
    seed,
    ...TYPE_SIGNALS[type],
    dataTo: null,
    outages: [],
    ...extra,
  })

  const devices: StoredDevice[] = [
    {
      id: id(101),
      applianceId: id(1),
      label: 'Plug behind the fridge',
      token: 'hpd_seededfridgetoken000000000000000001',
      createdAt: iso(now - 45 * DAY),
      revokedAt: null,
      profile: profile(11, 'FRIDGE', {
        dataFrom: now - 45 * DAY,
        ramp: { startMs: now - 14 * DAY, endMs: now, factor: 1.14 },
        outages: [
          { fromMs: now - 29 * HOUR, toMs: now - 26 * HOUR },
          { fromMs: now - 5 * HOUR, toMs: now - 5 * HOUR + 25 * MIN },
        ],
      }),
    },
    {
      id: id(102),
      applianceId: id(2),
      label: 'AC wall plug',
      token: 'hpd_seededactoken000000000000000000002',
      createdAt: iso(now - 60 * DAY),
      revokedAt: null,
      profile: profile(22, 'AIR_CONDITIONER', { dataFrom: now - 60 * DAY }),
    },
    {
      id: id(103),
      applianceId: id(3),
      label: 'Pump sensor',
      token: 'hpd_seededpumptoken00000000000000000003',
      createdAt: iso(now - 30 * DAY),
      revokedAt: null,
      profile: profile(33, 'WATER_PUMP', {
        dataFrom: now - 30 * DAY,
        stuckOnSince: now - 20 * HOUR,
      }),
    },
    {
      id: id(104),
      applianceId: id(3),
      label: 'Old pump sensor',
      token: 'hpd_seededoldpumptoken000000000000000004',
      createdAt: iso(now - 50 * DAY),
      revokedAt: iso(now - 30 * DAY),
      profile: profile(44, 'WATER_PUMP', { dataFrom: now - 50 * DAY, dataTo: now - 30 * DAY }),
    },
  ]

  const alerts: StoredAlert[] = [
    {
      id: id(201),
      applianceId: id(1),
      kind: 'POWER_SHIFT',
      severity: 'WARNING',
      status: 'OPEN',
      message:
        'Running power is 14% higher than the learned normal for this time of day (137 W vs 120 W).',
      evidence: {
        model: 'seasonal-robust-z/1',
        mlScore: 1.6,
        zScore: 6.4,
        zThreshold: 4,
        baselineWatts: 120,
        currentWatts: 136.8,
        changePct: 14,
        windowHours: 6,
        hoursSustained: 3,
      },
      decidedBy: 'ML',
      openedAt: iso(now - 26 * HOUR),
      updatedAt: iso(now - 20 * MIN),
      acknowledgedAt: null,
      resolvedAt: null,
    },
    {
      id: id(202),
      applianceId: id(1),
      kind: 'DUTY_CYCLE_DRIFT',
      severity: 'WARNING',
      status: 'ACKNOWLEDGED',
      message: 'Runs 47% of the time vs 40% normally. Each run lasts 21 min vs 16 min normally.',
      evidence: {
        baselineDutyPct: 40,
        currentDutyPct: 47.2,
        baselineCycleMinutes: 16,
        currentCycleMinutes: 21.4,
        windowHours: 6,
      },
      openedAt: iso(now - 3 * DAY),
      updatedAt: iso(now - 20 * MIN),
      acknowledgedAt: iso(now - 2 * DAY),
      resolvedAt: null,
    },
    {
      id: id(203),
      applianceId: id(3),
      kind: 'STUCK_ON',
      severity: 'CRITICAL',
      status: 'OPEN',
      message: 'Has been running non-stop for 20 h; the longest normal run is 14 min.',
      evidence: {
        runMinutes: 1200,
        limitMinutes: 120,
        longestNormalRunMinutes: 14,
        since: iso(now - 20 * HOUR),
      },
      openedAt: iso(now - 18 * HOUR),
      updatedAt: iso(now - 20 * MIN),
      acknowledgedAt: null,
      resolvedAt: null,
    },
    {
      id: id(204),
      applianceId: id(3),
      kind: 'NO_DATA',
      severity: 'WARNING',
      status: 'RESOLVED',
      message: 'No readings for 2 h 10 min (last seen earlier).',
      evidence: {
        lastSeen: iso(now - 10 * DAY - 130 * MIN),
        silentMinutes: 130,
        thresholdMinutes: 90,
      },
      openedAt: iso(now - 10 * DAY),
      updatedAt: iso(now - 10 * DAY + 3 * HOUR),
      acknowledgedAt: null,
      resolvedAt: iso(now - 10 * DAY + 3 * HOUR),
    },
  ]
  return { appliances, devices, alerts }
}

export const emptySeed = (): SeedData => ({ appliances: [], devices: [], alerts: [] })
