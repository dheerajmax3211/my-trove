import { useId, type SVGProps } from 'react'
import { cx } from '../../internal/cx'
import styles from './Logo.module.css'

export type LogoVariant = 'full' | 'mark' | 'wordmark'
export type LogoTone = 'color' | 'mono' | 'inverse'
export type LogoSize = 'sm' | 'md' | 'lg' | 'xl'

/** Height in px of the mark for each size; the wordmark scales with it. */
const HEIGHT: Record<LogoSize, number> = { sm: 24, md: 32, lg: 44, xl: 64 }

/** A keyhole whose stem is cut like a key bit (three steps down the right edge). */
const KEYHOLE =
  'M14.3 17.1A5 5 0 1 1 17.7 17.1L18.1 20.2L16.9 20.2L16.9 21.7L18.3 21.7L18.7 25.5L13.3 25.5Z'

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** `full` = mark + wordmark, `mark` = the tile alone, `wordmark` = the name alone. */
  variant?: LogoVariant
  /** `color` (default) is the vault tile with a brass keyhole and adapts inside `data-surface="vault"`; `mono` follows currentColor; `inverse` forces the on-dark version (photographs, always-dark backgrounds). */
  tone?: LogoTone
  size?: LogoSize
  /** Accessible name. Pass an empty string to mark the logo decorative (e.g. beside visible text). Default "My-Trove". */
  title?: string
}

/**
 * The mark is a deposit box seen from the front: a rounded tile with a keyhole whose stem is cut
 * like a key bit. The tile is the vault, the notch is the thing you lend. The wordmark is set in
 * the display face; the hyphen is the only place the brass shows in text.
 */
export function Logo({
  variant = 'full',
  tone = 'color',
  size = 'md',
  title = 'My-Trove',
  className,
  ...rest
}: LogoProps) {
  const titleId = useId()
  const maskId = useId()
  const h = HEIGHT[size]
  const decorative = title === ''
  const showMark = variant !== 'wordmark'
  const showWord = variant !== 'mark'
  const markW = 32
  const wordW = 100
  const gap = showMark && showWord ? 10 : 0
  const width = (showMark ? markW : 0) + gap + (showWord ? wordW : 0)
  const viewBoxW = width
  const x0 = showMark ? markW + gap : 0

  return (
    <svg
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-labelledby={decorative ? undefined : titleId}
      focusable="false"
      width={(h * viewBoxW) / 32}
      height={h}
      viewBox={`0 0 ${viewBoxW} 32`}
      className={cx(styles.logo, styles[tone], className)}
      {...rest}
    >
      {decorative ? null : <title id={titleId}>{title}</title>}
      {showMark ? (
        <g>
          {tone === 'mono' ? (
            <>
              <mask id={maskId}>
                <rect width="32" height="32" fill="#fff" />
                <path d={KEYHOLE} fill="#000" />
              </mask>
              <rect
                className={styles.tile}
                width="32"
                height="32"
                rx="9"
                mask={`url(#${maskId})`}
              />
            </>
          ) : (
            <>
              <rect className={styles.tile} width="32" height="32" rx="9" />
              <rect
                className={styles.tileEdge}
                x="0.5"
                y="0.5"
                width="31"
                height="31"
                rx="8.5"
                fill="none"
              />
              <path className={styles.keyhole} d={KEYHOLE} />
            </>
          )}
        </g>
      ) : null}
      {showWord ? (
        <text
          className={styles.word}
          x={x0}
          y="22.5"
          fontSize="21"
          textLength={wordW}
          lengthAdjust="spacing"
        >
          <tspan>My</tspan>
          <tspan className={styles.hyphen}>-</tspan>
          <tspan>Trove</tspan>
        </text>
      ) : null}
    </svg>
  )
}
