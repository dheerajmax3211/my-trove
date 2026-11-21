/**
 * What the product does in one picture: a fridge's power trace cycles on and off inside a shaded "normal" band, then
 * the cycles climb out of it and an alert is raised. Ink outlines and flat tints from the page's own palette, one brass
 * detail (the alert marker). The words that matter are in the caption beside it, so the drawing is decorative.
 */
export function BaselineDiagram({ width = 360 }: { width?: number }) {
  // Seven cycles: four inside the learned band, three above it.
  const low = 128
  const normalHigh = 78
  const risenHigh = 52
  const cycle = (x: number, high: number) =>
    `L${x} ${low} L${x + 6} ${high} L${x + 30} ${high} L${x + 36} ${low}`
  const trace = [
    `M20 ${low}`,
    cycle(32, normalHigh),
    cycle(82, normalHigh),
    cycle(132, normalHigh),
    cycle(182, normalHigh),
    cycle(232, risenHigh),
    cycle(282, risenHigh),
    `L336 ${low}`,
  ].join(' ')

  return (
    <svg
      className="hp-diagram"
      viewBox="0 0 360 170"
      width={width}
      height={(width * 170) / 360}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse className="hp-diagram-shadow" cx="180" cy="156" rx="150" ry="7" />
      <rect className="hp-diagram-paper" x="8" y="14" width="344" height="132" rx="12" />
      {/* the learned normal */}
      <rect className="hp-diagram-band" x="20" y="68" width="316" height="20" rx="4" />
      <line className="hp-diagram-ghost" x1="20" y1="68" x2="336" y2="68" />
      <line className="hp-diagram-ghost" x1="20" y1="88" x2="336" y2="88" />
      <text className="hp-diagram-label" x="26" y="62">
        Learned normal
      </text>
      {/* the trace */}
      <path className="hp-diagram-trace" d={trace} />
      <line className="hp-diagram-ghost" x1="20" y1={low} x2="336" y2={low} />
      {/* the alert */}
      <line className="hp-diagram-ghost" x1="258" y1="24" x2="258" y2="128" />
      <circle className="hp-diagram-alert" cx="258" cy="36" r="9" />
      <path className="hp-diagram-alert-mark" d="M258 31v6M258 40.5v.5" />
      <text className="hp-diagram-label" x="200" y="30" textAnchor="end">
        Alert
      </text>
    </svg>
  )
}
