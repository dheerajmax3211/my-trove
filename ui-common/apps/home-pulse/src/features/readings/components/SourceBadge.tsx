import { Badge } from '@platform/ui'
import { SimulatedBadge } from '../../simulation/SimulationControls'
import { SOURCE_LABELS } from '../copy'
import type { ReadingSource } from '../types'

/**
 * The label for anything not measured by a device: simulated numbers and numbers the owner entered. A plug's readings
 * need no label, since they are what the appliance reported.
 */
export function SourceBadge({ source }: { source: ReadingSource | null | undefined }) {
  if (source === 'SIMULATED') return <SimulatedBadge />
  if (source === 'MANUAL') {
    return (
      <Badge
        variant="neutral"
        title="These readings were entered by you, not reported by a device."
      >
        {SOURCE_LABELS.MANUAL}
      </Badge>
    )
  }
  return null
}
