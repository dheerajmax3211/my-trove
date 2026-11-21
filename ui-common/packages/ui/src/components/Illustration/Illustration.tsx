import { useId, type ReactNode, type SVGProps } from 'react'
import { cx } from '../../internal/cx'
import styles from './Illustration.module.css'

export interface IllustrationProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Width in px. The drawing keeps its 4:3 proportion. Default 220. */
  size?: number
  /** Accessible name. Omit for decorative use (the usual case beside a heading). */
  title?: string
}

function Frame({
  size = 220,
  title,
  className,
  children,
  ...rest
}: IllustrationProps & { children: ReactNode }) {
  const titleId = useId()
  return (
    <svg
      viewBox="0 0 240 180"
      width={size}
      height={(size * 3) / 4}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      focusable="false"
      className={cx(styles.art, className)}
      {...rest}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      {children}
    </svg>
  )
}

/**
 * The illustration language: one-weight ink outlines (1.75px, round joins) on flat tints of the
 * page's own palette, a single brass detail per drawing, a soft floor shadow. Everything is
 * built from tokens, so each drawing follows the theme and the surrounding product accent.
 */

/** An open deposit drawer with nothing in it yet. Use for empty lists. */
export function IllustrationEmpty(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <ellipse className={styles.shadow} cx="120" cy="152" rx="78" ry="8" />
      <path className={cx(styles.sunk, styles.ink)} d="M50 86 L64 48 H176 L190 86 Z" />
      <rect className={styles.ghost} x="82" y="58" width="36" height="18" rx="3" />
      <rect className={styles.ghost} x="128" y="62" width="40" height="14" rx="3" />
      <rect className={cx(styles.paper, styles.ink)} x="46" y="84" width="148" height="62" rx="9" />
      <rect className={cx(styles.tint, styles.ink)} x="58" y="96" width="124" height="38" rx="6" />
      <circle className={cx(styles.brass, styles.ink)} cx="120" cy="111" r="5" />
      <path className={cx(styles.brass, styles.ink)} d="M118.2 115.5h3.6l1.2 9h-6z" />
    </Frame>
  )
}

/** A page with a lens over it that found nothing. Use for empty search results. */
export function IllustrationSearch(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <ellipse className={styles.shadow} cx="116" cy="152" rx="74" ry="8" />
      <rect
        className={cx(styles.paper, styles.ink)}
        x="46"
        y="28"
        width="118"
        height="110"
        rx="10"
      />
      <path className={cx(styles.ink, styles.soft)} d="M62 52h50M62 70h82M62 88h60M62 106h44" />
      <circle className={cx(styles.lens, styles.ink)} cx="150" cy="102" r="30" />
      <path className={cx(styles.ink, styles.thick)} d="M171 123 L196 148" />
      <path className={cx(styles.brassStroke, styles.thick)} d="M172 124 L195 147" />
      <path className={styles.ink} d="M141 93l18 18M159 93l-18 18" />
    </Frame>
  )
}

/** A sealed letter with a clock: something has been sent and is waiting. */
export function IllustrationLetter(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <ellipse className={styles.shadow} cx="116" cy="152" rx="82" ry="8" />
      <rect
        className={cx(styles.paper, styles.ink)}
        x="40"
        y="60"
        width="152"
        height="90"
        rx="10"
      />
      <path className={styles.ink} d="M42 140 L98 100 M190 140 L134 100" />
      <path className={cx(styles.tint, styles.ink)} d="M42 70 L116 116 L190 70" />
      <circle className={cx(styles.brass, styles.ink)} cx="116" cy="116" r="14" />
      <circle className={styles.ink} cx="116" cy="113" r="3" />
      <path className={styles.ink} d="M116 115v6" />
      <circle className={cx(styles.paper, styles.ink)} cx="190" cy="54" r="22" />
      <path className={styles.ink} d="M190 41v13l8 5" />
      <path className={styles.ghostStroke} d="M154 40a40 40 0 0 1 14-10" />
    </Frame>
  )
}

/** A key on a permission tag: access granted, and only as far as the tag says. */
export function IllustrationKey(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <ellipse className={styles.shadow} cx="120" cy="154" rx="82" ry="8" />
      <g transform="rotate(-5 140 120)">
        <rect
          className={cx(styles.tint, styles.ink)}
          x="76"
          y="86"
          width="124"
          height="64"
          rx="10"
        />
        <path className={cx(styles.ink, styles.soft)} d="M94 108h56M94 124h78M94 138h34" />
        <circle className={cx(styles.paper, styles.ink)} cx="184" cy="100" r="5" />
      </g>
      <g transform="rotate(24 62 62)">
        <rect
          className={cx(styles.brass, styles.ink)}
          x="76"
          y="56"
          width="104"
          height="13"
          rx="4"
        />
        <path className={cx(styles.brass, styles.ink)} d="M148 69v15h10V69M166 69v10h10V69" />
        <circle className={cx(styles.brass, styles.ink)} cx="62" cy="62" r="24" />
        <circle className={cx(styles.paper, styles.ink)} cx="62" cy="62" r="9" />
      </g>
    </Frame>
  )
}

/** A dial turned to rest with a tick: nothing needs you. Use for "all caught up". */
export function IllustrationAllClear(props: IllustrationProps) {
  const ticks = Array.from({ length: 36 }, (_, i) => i)
  return (
    <Frame {...props}>
      <ellipse className={styles.shadow} cx="120" cy="154" rx="70" ry="8" />
      <circle className={cx(styles.paper, styles.ink)} cx="120" cy="84" r="62" />
      {ticks.map((i) => {
        const a = (i * 10 * Math.PI) / 180
        const long = i % 3 === 0
        const r1 = long ? 49 : 53
        return (
          <line
            key={i}
            className={styles.ink}
            x1={120 + Math.sin(a) * r1}
            y1={84 - Math.cos(a) * r1}
            x2={120 + Math.sin(a) * 57}
            y2={84 - Math.cos(a) * 57}
          />
        )
      })}
      <circle className={cx(styles.tint, styles.ink)} cx="120" cy="84" r="40" />
      <path className={cx(styles.ink, styles.thick)} d="M102 86l12 12 24-27" />
      <circle className={cx(styles.brass, styles.ink)} cx="120" cy="22" r="4.5" />
      <path className={styles.brassStroke} d="M44 44v10M39 49h10M200 112v10M195 117h10" />
    </Frame>
  )
}

/** A padlock inside a dashed ring: this part is closed to you. Use for permission-denied states. */
export function IllustrationLocked(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <ellipse className={styles.shadow} cx="120" cy="154" rx="66" ry="8" />
      <circle className={styles.ghost} cx="120" cy="100" r="68" />
      <path className={cx(styles.ink, styles.thick)} d="M97 90V70a23 23 0 0 1 46 0v20" />
      <rect className={cx(styles.tint, styles.ink)} x="80" y="88" width="80" height="60" rx="11" />
      <circle className={cx(styles.brass, styles.ink)} cx="120" cy="113" r="8" />
      <path className={cx(styles.brass, styles.ink)} d="M117.2 119h5.6l1.8 15h-9.2z" />
    </Frame>
  )
}

export const illustrations = {
  empty: IllustrationEmpty,
  search: IllustrationSearch,
  letter: IllustrationLetter,
  key: IllustrationKey,
  allClear: IllustrationAllClear,
  locked: IllustrationLocked,
} as const

export type IllustrationName = keyof typeof illustrations

export interface NamedIllustrationProps extends IllustrationProps {
  name: IllustrationName
}

/** Pick one of the six drawings by name. */
export function Illustration({ name, ...rest }: NamedIllustrationProps) {
  const Art = illustrations[name]
  return <Art {...rest} />
}
