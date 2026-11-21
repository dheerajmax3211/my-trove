import type { AlertFilter } from '../features/alerts/types'

/**
 * Hierarchical cache keys: invalidating `appliances` refreshes the list, every detail, health, devices and
 * readings in one go.
 */
export const keys = {
  appliances: ['appliances'] as const,
  appliance: (id: string) => ['appliances', id] as const,
  health: (id: string) => ['appliances', id, 'health'] as const,
  devices: (id: string) => ['appliances', id, 'devices'] as const,
  currentDraw: (id: string) => ['appliances', id, 'current-draw'] as const,
  readings: (id: string, range: string) => ['appliances', id, 'readings', range] as const,
  alerts: ['alerts'] as const,
  alertList: (filter: AlertFilter, applianceId?: string) =>
    ['alerts', filter, applianceId ?? null] as const,
  reminders: ['reminders'] as const,
}
