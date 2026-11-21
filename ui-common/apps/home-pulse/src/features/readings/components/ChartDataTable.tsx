import { useMemo } from 'react'
import { formatDuration, formatWatts } from '../../../lib/format'
import { formatSpan } from '../chart/labels'
import { tableRows, type Gap, type Point } from '../chart/series'
import styles from './PowerChart.module.css'

export interface ChartDataTableProps {
  points: readonly Point[]
  gaps: readonly Gap[]
  from: number
  to: number
  intervalMs: number
  bucketed: boolean
  caption: string
  maxRows?: number
}

/** The chart's data as a plain table, for screen readers and anyone who prefers numbers. */
export function ChartDataTable({
  points,
  gaps,
  from,
  to,
  intervalMs,
  bucketed,
  caption,
  maxRows = 48,
}: ChartDataTableProps) {
  const rows = useMemo(
    () => tableRows(points, gaps, from, to, intervalMs, maxRows),
    [points, gaps, from, to, intervalMs, maxRows],
  )
  const summarised = points.length > maxRows
  return (
    <div className={styles.tableWrap}>
      {summarised ? (
        <p className={styles.tableNote}>
          {points.length.toLocaleString()} readings are summarised into {maxRows} equal time slots.
        </p>
      ) : null}
      <table className={styles.table}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">{bucketed || summarised ? 'Average' : 'Power'}</th>
            <th scope="col">Lowest</th>
            <th scope="col">Highest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row.kind === 'gap' ? (
              <tr key={`gap-${row.start}`} className={styles.gapRow}>
                <th scope="row">{formatSpan(row.start, row.end, true)}</th>
                <td colSpan={3}>No data for {formatDuration((row.end - row.start) / 60_000)}</td>
              </tr>
            ) : (
              <tr key={row.start}>
                <th scope="row">{formatSpan(row.start, row.end, bucketed || summarised)}</th>
                <td>{formatWatts(row.avg)}</td>
                <td>{formatWatts(row.min)}</td>
                <td>{formatWatts(row.max)}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
