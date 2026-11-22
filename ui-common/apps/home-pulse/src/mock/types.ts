import type { AlertKind, AlertStatus, Severity } from '../features/alerts/types'
import type { ApplianceType } from '../features/appliances/types'
import type { ManualState } from './manual'
import type { SignalProfile } from './signal'

export interface StoredAppliance {
  id: string
  name: string
  type: ApplianceType
  location: string | null
  purchaseDate: string | null
  warrantyEndDate: string | null
  lastServiceDate: string | null
  nextServiceDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface StoredDevice {
  id: string
  applianceId: string
  label: string
  token: string
  createdAt: string
  revokedAt: string | null
  profile: SignalProfile
  /** The built-in simulator. */
  simulated?: boolean
  /** Readings the owner entered by hand. Such a device has its own samples and meter totals, not a profile. */
  manual?: ManualState
  /** Where baseline learning counts from, when it is not the registration time (a simulated history). */
  learnFromMs?: number
}

export interface StoredAlert {
  id: string
  applianceId: string
  kind: AlertKind
  severity: Severity
  status: AlertStatus
  message: string
  evidence: Record<string, unknown>
  openedAt: string
  updatedAt: string
  acknowledgedAt: string | null
  resolvedAt: string | null
  /** Opened by the simulator; removed or closed when the simulation is. */
  simulated?: boolean
}
