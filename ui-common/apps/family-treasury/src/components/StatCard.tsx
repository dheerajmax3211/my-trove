import { Card, CardContent } from '@platform/ui'
import type { ReactNode } from 'react'

export interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
}

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <Card className="ft-stat">
      <CardContent>
        <p className="ft-stat-label">{label}</p>
        <p className="ft-stat-value">{value}</p>
        {hint ? <p className="ft-stat-hint">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}
