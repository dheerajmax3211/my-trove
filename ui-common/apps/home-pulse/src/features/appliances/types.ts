/** Mirrors the home-pulse DTO records (ApplianceResponse, ApplianceRequest, ApplianceHealth). */
import type { AlertDto } from '../alerts/types'
import type { ReadingSource } from '../readings/types'

export const APPLIANCE_TYPES = [
  'FRIDGE',
  'AIR_CONDITIONER',
  'WATER_PUMP',
  'WASHING_MACHINE',
  'OTHER',
] as const
export type ApplianceType = (typeof APPLIANCE_TYPES)[number]

/** `YYYY-MM-DD`. */
export type LocalDate = string

export interface Appliance {
  id: string
  name: string
  type: ApplianceType
  location: string | null
  purchaseDate: LocalDate | null
  warrantyEndDate: LocalDate | null
  lastServiceDate: LocalDate | null
  nextServiceDate: LocalDate | null
  notes: string | null
  underWarranty: boolean
  daysToWarrantyEnd: number | null
  serviceOverdue: boolean
  createdAt: string
  updatedAt: string
}

export interface ApplianceInput {
  name: string
  type: ApplianceType
  location?: string | null
  purchaseDate?: LocalDate | null
  warrantyEndDate?: LocalDate | null
  lastServiceDate?: LocalDate | null
  nextServiceDate?: LocalDate | null
  notes?: string | null
}

export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'LEARNING' | 'NO_DEVICE'

export interface Baseline {
  standbyWatts: number
  peakWatts: number
  onThresholdWatts: number
  switching: boolean
  onLevelMedian: number
  onLevelSpread: number
  dutyMedian: number
  dutySpread: number
  cycleMinutesMedian: number
  cycleMinutesSpread: number
  maxOnRunMinutes: number
  maxOffRunMinutes: number
  windowsUsed: number
  learnedFrom: string
  learnedTo: string
}

export interface Last24h {
  avgWatts: number
  maxWatts: number
  energyKwh: number
  /** `null` when the baseline is not ready or the appliance does not switch. */
  dutyPct: number | null
  minutesWithData: number
}

export interface ServiceInfo {
  underWarranty: boolean
  warrantyEndDate: LocalDate | null
  daysToWarrantyEnd: number | null
  lastServiceDate: LocalDate | null
  nextServiceDate: LocalDate | null
  serviceOverdue: boolean
}

export interface ApplianceHealth {
  applianceId: string
  name: string
  status: HealthStatus
  baselineStatus: 'NONE' | 'LEARNING' | 'READY'
  baselineLearnedAt: string | null
  baseline: Baseline | null
  lastReadingAt: string | null
  last24h: Last24h | null
  activeAlerts: AlertDto[]
  service: ServiceInfo
  /** The readings behind this health come from the built-in simulator. */
  simulated?: boolean
  /** Where the energy numbers come from: a device, the owner's manual entries, the simulator, or nowhere (null). */
  source?: ReadingSource | null
}

export const TYPE_LABELS: Record<ApplianceType, string> = {
  FRIDGE: 'Fridge',
  AIR_CONDITIONER: 'Air conditioner',
  WATER_PUMP: 'Water pump',
  WASHING_MACHINE: 'Washing machine',
  OTHER: 'Other',
}
