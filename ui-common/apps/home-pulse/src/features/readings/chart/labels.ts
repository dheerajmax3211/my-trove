const DAY = 86_400_000

/** Axis label for a tick: the time of day for short spans, the weekday and time for a day or two, the date beyond. */
export function formatTick(t: number, stepMs: number, spanMs: number): string {
  const date = new Date(t)
  if (stepMs >= DAY) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (spanMs > 1.5 * DAY)
    return date.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Tooltip / table wording for one bucket: "Nov 19, 10:42" for a point, "Nov 19, 10:00 to 11:00" for a bucket. */
export function formatSpan(start: number, end: number, bucketed: boolean): string {
  const day = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = (t: number) =>
    new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (!bucketed) return `${day(start)}, ${time(start)}`
  if (end - start >= DAY) return day(start)
  return `${day(start)}, ${time(start)} to ${time(end)}`
}
