import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@platform/ui'
import { useState, type ReactNode } from 'react'
import { ErrorState } from '../../../components/ErrorState'
import { useReadings } from '../hooks'
import type { RangeKey } from '../types'
import { PowerChart } from './PowerChart'
import { RangeSelector } from './RangeSelector'

const RANGE_LABELS: Record<RangeKey, string> = {
  hour: 'last hour',
  day: 'last 24 hours',
  week: 'last 7 days',
  month: 'last 30 days',
}

export interface PowerChartSectionProps {
  applianceId: string
  hasDevice: boolean
  /** Shown as the dashed "learned normal" line. */
  normalWatts?: number | null
  /** Rendered when no device is connected yet (a call to action). */
  noDeviceAction?: ReactNode
  /** The appliance's health is still loading, so whether a device exists is not known yet. */
  loading?: boolean
}

/** The appliance's power chart with a range switcher and its own loading, empty and error states. */
export function PowerChartSection({
  applianceId,
  hasDevice,
  normalWatts,
  noDeviceAction,
  loading = false,
}: PowerChartSectionProps) {
  const [range, setRange] = useState<RangeKey>('day')
  const readings = useReadings(applianceId, range, hasDevice)

  let body: ReactNode
  if (loading) {
    body = (
      <div role="status" aria-busy="true" aria-label="Loading readings">
        <Skeleton height="17.5rem" />
      </div>
    )
  } else if (!hasDevice) {
    body = (
      <EmptyState
        headingAs="h3"
        title="No device connected"
        description="Connect a smart plug or sensor to this appliance and its power draw will appear here."
        action={noDeviceAction}
      />
    )
  } else if (readings.isError) {
    body = (
      <ErrorState
        headingAs="h3"
        title="Could not load readings"
        error={readings.error}
        onRetry={() => void readings.refetch()}
      />
    )
  } else if (readings.isPending) {
    body = (
      <div role="status" aria-busy="true" aria-label="Loading readings">
        <Skeleton height="17.5rem" />
      </div>
    )
  } else if (readings.data.points.length === 0) {
    body = (
      <EmptyState
        headingAs="h3"
        title="No readings in this period"
        description={`Nothing was received in the ${RANGE_LABELS[range]}. Try a longer range, or check that the plug is powered and online.`}
      />
    )
  } else {
    body = (
      <PowerChart
        series={readings.data}
        rangeLabel={RANGE_LABELS[range]}
        referenceWatts={normalWatts ?? null}
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="hp-section-head">
          <div>
            <CardTitle as="h2">Power draw</CardTitle>
            <CardDescription>Watts reported by the plug, {RANGE_LABELS[range]}.</CardDescription>
          </div>
          {hasDevice ? <RangeSelector value={range} onChange={setRange} /> : null}
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
