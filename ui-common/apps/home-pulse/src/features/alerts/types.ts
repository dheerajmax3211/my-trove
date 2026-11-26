/** Mirrors AlertResponse, AlertKind, Severity and AlertStatus. */
export type AlertKind = 'POWER_SHIFT' | 'DUTY_CYCLE_DRIFT' | 'STUCK_ON' | 'STOPPED' | 'NO_DATA'
export type Severity = 'INFO' | 'WARNING' | 'CRITICAL'
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'

export interface AlertDto {
  id: string
  applianceId: string
  applianceName: string
  kind: AlertKind
  severity: Severity
  status: AlertStatus
  message: string
  /** Flat JSON written by the detector; its keys depend on `kind`. Read it through `describeAlert`. */
  evidence: Record<string, unknown>
  openedAt: string
  updatedAt: string
  acknowledgedAt: string | null
  resolvedAt: string | null
  underWarranty: boolean
  warrantyEndDate: string | null
  daysToWarrantyEnd: number | null
  lastServiceDate: string | null
  nextServiceDate: string | null
  serviceOverdue: boolean
  /** Opened by the built-in simulator rather than a real device. */
  simulated: boolean
}

/** What the inbox shows. `ACTIVE` is the service default (open and acknowledged, no history). */
export type AlertFilter = 'ACTIVE' | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'ALL'

export const ALERT_FILTERS: readonly { value: AlertFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'Needs attention' },
  { value: 'OPEN', label: 'Open' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'ALL', label: 'All, with history' },
]
