import { useId, type SVGProps } from 'react'
import { cx } from '../../internal/cx'
import styles from './Pattern.module.css'

/** Key bitting: the depth (0 to 6) of each cut along a key blade. Fixed so the pattern is stable. */
const BITTING = [3, 5, 2, 6, 4, 1, 5, 3, 6, 2, 4, 5, 1, 4, 6, 3] as const
const CUT_W = 8
const BASE = 4
const STEP = 3

function bittingPath(height: number): string {
  let d = `M0 ${height}`
  BITTING.forEach((level, i) => {
    const y = height - (BASE + level * STEP)
    d += ` V${y} H${(i + 1) * CUT_W}`
  })
  return `${d} V${height} Z`
}

export interface KeyCutProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Height in px of the tallest tooth. Default 24. */
  height?: number
}

/**
 * A strip of key bitting that repeats across its width. It is the vault's quiet signature: use
 * it as a divider, the edge of a hero band, or a footer rule. Decorative (hidden from AT); the
 * color is `currentColor` so set it with `color`.
 */
export function KeyCut({ height = 24, className, ...rest }: KeyCutProps) {
  const id = useId()
  const tileW = BITTING.length * CUT_W
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="100%"
      height={height}
      className={cx(styles.keycut, className)}
      {...rest}
    >
      <defs>
        <pattern id={id} width={tileW} height={height} patternUnits="userSpaceOnUse">
          <path d={bittingPath(height)} fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height={height} fill={`url(#${id})`} />
    </svg>
  )
}

export interface VaultRingsProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Turn the dial once on mount, then settle. Ignored under prefers-reduced-motion. */
  animate?: boolean
}

const TICKS = Array.from({ length: 72 }, (_, i) => i)

/**
 * A combination-lock dial: concentric rings, a ring of tick marks and a brass hub. It is the hero
 * motif, drawn large and low-contrast behind headlines (set `color`, use opacity). Decorative.
 */
export function VaultRings({ animate = false, className, ...rest }: VaultRingsProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 400 400"
      className={cx(styles.rings, className)}
      {...rest}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <circle cx="200" cy="200" r="196" />
        <circle cx="200" cy="200" r="150" />
        <circle cx="200" cy="200" r="104" />
        <circle cx="200" cy="200" r="62" />
      </g>
      <g
        className={animate ? styles.dial : undefined}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        {TICKS.map((i) => {
          const long = i % 6 === 0
          const angle = (i * 5 * Math.PI) / 180
          const r1 = long ? 160 : 168
          const r2 = 184
          return (
            <line
              key={i}
              x1={200 + Math.sin(angle) * r1}
              y1={200 - Math.cos(angle) * r1}
              x2={200 + Math.sin(angle) * r2}
              y2={200 - Math.cos(angle) * r2}
              strokeWidth={long ? 1.75 : 1}
            />
          )
        })}
      </g>
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M200 138v-30M200 262v30M146 169l-26-15M254 231l26 15M146 231l-26 15M254 169l26-15" />
      </g>
      <circle className={styles.hub} cx="200" cy="200" r="14" />
    </svg>
  )
}
