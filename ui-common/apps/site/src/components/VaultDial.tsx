import { productIds } from '../content/products'
import { usePlayback } from '../motion/playback'
import styles from './VaultDial.module.css'

const TAU = Math.PI * 2

function ticks(count: number, inner: number, outer: number): string {
  let d = ''
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU
    const long = i % 5 === 0
    const r0 = long ? inner - 6 : inner
    d += `M${(300 + Math.cos(a) * r0).toFixed(1)} ${(300 + Math.sin(a) * r0).toFixed(1)}L${(300 + Math.cos(a) * outer).toFixed(1)} ${(300 + Math.sin(a) * outer).toFixed(1)}`
  }
  return d
}

/**
 * Generative art for the hero: a vault dial whose rings turn at different speeds while the six
 * products orbit the keyhole. Pure SVG, one rotation per ring, transform only. It runs only while
 * the visitor's play/pause control says so, and it is decorative.
 */
export function VaultDial() {
  const { playing } = usePlayback()
  return (
    <svg
      className={styles.dial}
      viewBox="0 0 600 600"
      aria-hidden="true"
      focusable="false"
      data-playing={playing ? 'true' : 'false'}
    >
      <defs>
        <radialGradient id="dial-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--pp-color-lime)" stopOpacity="0.55" />
          <stop offset="55%" stopColor="var(--pp-color-lime)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--pp-color-lime)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="300" cy="300" r="290" fill="url(#dial-core)" className={styles.pulse} />

      <g className={styles.ringA}>
        <circle cx="300" cy="300" r="268" className={styles.hair} />
        <path d={ticks(120, 252, 268)} className={styles.tick} />
      </g>
      <g className={styles.ringB}>
        <circle cx="300" cy="300" r="214" className={styles.dash} />
        <circle cx="300" cy="300" r="190" className={styles.hair} />
      </g>
      <g className={styles.ringC}>
        <circle cx="300" cy="300" r="140" className={styles.hair} />
        <path d="M300 160a140 140 0 0 1 121 70" className={styles.arc} />
      </g>

      <g className={styles.orbit}>
        {productIds.map((id, i) => {
          const a = (i / productIds.length) * TAU - Math.PI / 2
          const x = 300 + Math.cos(a) * 214
          const y = 300 + Math.sin(a) * 214
          return (
            <g key={id}>
              <line x1="300" y1="300" x2={x} y2={y} className={styles.spoke} />
              <circle cx={x} cy={y} r="16" fill={`var(--pp-color-product-${id})`} opacity="0.2" />
              <circle cx={x} cy={y} r="8" fill={`var(--pp-color-product-${id})`} />
            </g>
          )
        })}
      </g>

      <g className={styles.keyhole}>
        <circle cx="300" cy="300" r="46" className={styles.coreRing} />
        <path
          d="M300 282a14 14 0 0 1 6.5 26.4l3 24.6h-19l3-24.6A14 14 0 0 1 300 282Z"
          fill="var(--pp-color-lime)"
        />
      </g>
    </svg>
  )
}
