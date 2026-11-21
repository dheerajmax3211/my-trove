import { Badge, Card, CardContent, CardHeader, CardTitle, KeyValueList } from '@platform/ui'
import { formatDate, formatDaysUntil } from '../../../lib/format'
import { ReminderItem } from '../../reminders/components/ReminderItem'
import type { Reminder } from '../../reminders/types'
import type { Appliance, ApplianceHealth } from '../types'

export interface ServicePanelProps {
  appliance: Appliance
  service: ApplianceHealth['service'] | null
  reminders: readonly Reminder[]
}

function WarrantyBadge({ service }: { service: ApplianceHealth['service'] }) {
  if (!service.warrantyEndDate) return <Badge>No warranty recorded</Badge>
  if (!service.underWarranty) return <Badge variant="neutral">Warranty ended</Badge>
  const days = service.daysToWarrantyEnd ?? 0
  return <Badge variant={days <= 30 ? 'warning' : 'success'}>Under warranty</Badge>
}

export function ServicePanel({ appliance, service, reminders }: ServicePanelProps) {
  const info: ApplianceHealth['service'] = service ?? {
    underWarranty: appliance.underWarranty,
    warrantyEndDate: appliance.warrantyEndDate,
    daysToWarrantyEnd: appliance.daysToWarrantyEnd,
    lastServiceDate: appliance.lastServiceDate,
    nextServiceDate: appliance.nextServiceDate,
    serviceOverdue: appliance.serviceOverdue,
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Warranty and service</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="hp-stack-4">
          <KeyValueList
            className="hp-service-list"
            dense
            layout="stacked"
            items={[
              {
                id: 'warranty',
                label: 'Warranty',
                value: (
                  <>
                    <WarrantyBadge service={info} />
                    {info.warrantyEndDate ? (
                      <span className="hp-small">
                        {' '}
                        ends {formatDate(info.warrantyEndDate)}
                        {info.underWarranty && info.daysToWarrantyEnd !== null
                          ? ` (${formatDaysUntil(info.daysToWarrantyEnd)})`
                          : ''}
                      </span>
                    ) : null}
                  </>
                ),
              },
              { id: 'purchased', label: 'Purchased', value: formatDate(appliance.purchaseDate) },
              { id: 'last', label: 'Last serviced', value: formatDate(info.lastServiceDate) },
              {
                id: 'next',
                label: 'Next service',
                value: (
                  <>
                    {formatDate(info.nextServiceDate)}
                    {info.serviceOverdue ? (
                      <>
                        {' '}
                        <Badge variant="warning">Overdue</Badge>
                      </>
                    ) : null}
                  </>
                ),
              },
            ]}
          />
          {appliance.notes ? <p className="hp-small hp-notes">{appliance.notes}</p> : null}
          <div className="hp-stack-2">
            <h3 className="hp-subheading">Upcoming reminders</h3>
            {reminders.length === 0 ? (
              <p className="hp-muted hp-small">Nothing due in the next 60 days.</p>
            ) : (
              <ul className="hp-stack-3 hp-plain-list">
                {reminders.map((r) => (
                  <li key={r.type}>
                    <ReminderItem reminder={r} showAppliance={false} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
