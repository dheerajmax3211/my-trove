import { describe, expect, it } from 'vitest'
import type { AlertDto } from '../alerts/types'
import type { Appliance } from '../appliances/types'
import { buildTodayItems } from './todayItems'

const NOW = new Date('2026-11-19T12:00:00.000Z')

const appliance = (over: Partial<Appliance> & { id: string; name: string }): Appliance => ({
  type: 'FRIDGE',
  location: null,
  purchaseDate: null,
  warrantyEndDate: null,
  lastServiceDate: null,
  nextServiceDate: null,
  notes: null,
  underWarranty: false,
  daysToWarrantyEnd: null,
  serviceOverdue: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
})

const alert = (over: Partial<AlertDto> & { id: string }): AlertDto => ({
  applianceId: 'a1',
  applianceName: 'Kitchen fridge',
  kind: 'STUCK_ON',
  severity: 'WARNING',
  status: 'OPEN',
  message: 'Running non-stop.',
  evidence: {},
  openedAt: '2026-11-19T08:00:00Z',
  updatedAt: '2026-11-19T08:00:00Z',
  acknowledgedAt: null,
  resolvedAt: null,
  underWarranty: false,
  warrantyEndDate: null,
  daysToWarrantyEnd: null,
  lastServiceDate: null,
  nextServiceDate: null,
  serviceOverdue: false,
  ...over,
})

describe('buildTodayItems', () => {
  it('is empty when nothing needs a look', () => {
    expect(buildTodayItems([], [appliance({ id: 'a1', name: 'Fridge' })], NOW)).toEqual([])
  })

  it('lists open alerts by severity, ignoring acknowledged and resolved ones', () => {
    const items = buildTodayItems(
      [
        alert({ id: 'w', severity: 'WARNING' }),
        alert({ id: 'c', severity: 'CRITICAL', applianceId: 'a2', applianceName: 'Pump' }),
        alert({ id: 'i', severity: 'INFO' }),
        alert({ id: 'ack', status: 'ACKNOWLEDGED' }),
        alert({ id: 'done', status: 'RESOLVED' }),
      ],
      [],
      NOW,
    )
    expect(items.map((i) => [i.id, i.severity])).toEqual([
      ['alert-c', 'danger'],
      ['alert-w', 'warn'],
      ['alert-i', 'info'],
    ])
    const first = items[0]
    expect(first?.to).toBe('/appliances/a2')
    expect(first?.subtitle).toContain('Pump')
    expect(first?.dueAt).toBe('2026-11-19T08:00:00Z')
  })

  it('includes warranties ending within 30 days, and flags the last week as urgent', () => {
    const items = buildTodayItems(
      [],
      [
        appliance({
          id: 'a1',
          name: 'Fridge',
          underWarranty: true,
          warrantyEndDate: '2026-12-01',
          daysToWarrantyEnd: 12,
        }),
        appliance({
          id: 'a2',
          name: 'Washer',
          underWarranty: true,
          warrantyEndDate: '2026-11-22',
          daysToWarrantyEnd: 3,
        }),
        appliance({
          id: 'a3',
          name: 'TV',
          underWarranty: true,
          warrantyEndDate: '2027-03-01',
          daysToWarrantyEnd: 102,
        }),
        appliance({ id: 'a4', name: 'Old', warrantyEndDate: '2026-01-01' }),
      ],
      NOW,
    )
    expect(items.map((i) => [i.id, i.severity, i.to])).toEqual([
      ['warranty-a2', 'danger', '/appliances/a2'],
      ['warranty-a1', 'warn', '/appliances/a1'],
    ])
    expect(items[1]?.title).toBe('Fridge warranty ends in 12 days')
    expect(items[1]?.dueAt).toBe('2026-12-01')
  })

  it('includes services overdue or due within 14 days, not later ones', () => {
    const items = buildTodayItems(
      [],
      [
        appliance({
          id: 'a1',
          name: 'Pump',
          nextServiceDate: '2026-11-07',
          serviceOverdue: true,
        }),
        appliance({ id: 'a2', name: 'AC', nextServiceDate: '2026-11-30' }),
        appliance({ id: 'a3', name: 'Fridge', nextServiceDate: '2026-12-20' }),
      ],
      NOW,
    )
    expect(items.map((i) => [i.id, i.severity])).toEqual([
      ['service-a1', 'warn'],
      ['service-a2', 'info'],
    ])
    expect(items[0]?.title).toBe('Pump service is overdue')
    expect(items[0]?.subtitle).toBe('12 days overdue')
    expect(items[1]?.title).toBe('AC service is due in 11 days')
  })

  it('orders by severity, then by date, with unique ids', () => {
    const items = buildTodayItems(
      [alert({ id: 'w' })],
      [
        appliance({
          id: 'a1',
          name: 'Fridge',
          underWarranty: true,
          warrantyEndDate: '2026-12-01',
          daysToWarrantyEnd: 12,
          nextServiceDate: '2026-11-25',
        }),
      ],
      NOW,
    )
    expect(items.map((i) => i.id)).toEqual(['alert-w', 'warranty-a1', 'service-a1'])
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })
})
