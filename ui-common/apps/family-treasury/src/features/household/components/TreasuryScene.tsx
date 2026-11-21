import type { SVGProps } from 'react'

/**
 * The first-run drawing, in the design language's illustration style: one-weight ink outlines, flat tints from the
 * page's own palette, one brass detail (the approval seal), a soft floor shadow. A house, the pool (a jar of coins in
 * the middle) and a small pot for each person. Decorative; recolours with the theme and the product accent.
 */
export function TreasuryScene({
  size = 360,
  ...rest
}: { size?: number } & SVGProps<SVGSVGElement>) {
  const bowls = [74, 112, 248, 286]
  return (
    <svg
      viewBox="0 0 360 240"
      width={size}
      height={(size * 2) / 3}
      aria-hidden="true"
      focusable="false"
      className="ft-scene"
      {...rest}
    >
      <ellipse className="ft-art-shadow" cx="180" cy="218" rx="142" ry="9" />
      {/* the house: roof line, walls */}
      <path className="ft-art-ink" d="M44 122 L180 30 L316 122" />
      <rect className="ft-art-paper ft-art-ink" x="62" y="120" width="236" height="92" rx="7" />
      <rect className="ft-art-tint ft-art-ink" x="92" y="64" width="16" height="32" rx="2" />
      {/* the pool: a jar of coins */}
      <rect className="ft-art-paper ft-art-ink" x="142" y="112" width="76" height="100" rx="14" />
      <rect className="ft-art-tint ft-art-ink" x="150" y="156" width="60" height="48" rx="8" />
      <ellipse className="ft-art-paper ft-art-ink" cx="168" cy="166" rx="12" ry="5" />
      <ellipse className="ft-art-paper ft-art-ink" cx="192" cy="176" rx="12" ry="5" />
      <ellipse className="ft-art-paper ft-art-ink" cx="172" cy="188" rx="12" ry="5" />
      <rect className="ft-art-tint ft-art-ink" x="134" y="100" width="92" height="16" rx="6" />
      <path className="ft-art-ink" d="M166 108 H194" />
      {/* a pot for each person */}
      {bowls.map((x, i) => (
        <g key={x}>
          <path
            className="ft-art-paper ft-art-ink"
            d={`M${x - 17} 180 H${x + 17} A17 17 0 0 1 ${x - 17} 180 Z`}
          />
          <ellipse
            className="ft-art-tint ft-art-ink"
            cx={x}
            cy={178}
            rx={i % 2 ? 9 : 11}
            ry={3.5}
          />
        </g>
      ))}
      {/* the approval: a brass seal, with a ghost of where the next one would go */}
      <circle className="ft-art-ghost" cx="262" cy="74" r="20" />
      <circle className="ft-art-brass ft-art-ink" cx="296" cy="64" r="21" />
      <path className="ft-art-ink" d="M286 64 L293 71 L306 57" />
    </svg>
  )
}
