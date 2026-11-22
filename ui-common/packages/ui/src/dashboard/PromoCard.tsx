import { useId, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '../internal/cx'
import styles from './PromoCard.module.css'

export interface PromoCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode
  description?: ReactNode
  /** The action, usually a black `Button` or link pill. */
  action?: ReactNode
  /** Illustration slot. Defaults to a soft 3D orb with a keyhole. */
  illustration?: ReactNode
}

/** The default illustration: a lit sphere with a key-bit keyhole, built from gradients only. */
export function PromoOrb({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg
      viewBox="0 0 120 120"
      className={cx(styles.orb, className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-sphere`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#c9b8ff" />
          <stop offset="1" stopColor="#6c55e0" />
        </radialGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#111" stopOpacity="0.3" />
          <stop offset="1" stopColor="#111" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="108" rx="34" ry="7" fill={`url(#${id}-glow)`} />
      <circle cx="60" cy="58" r="42" fill={`url(#${id}-sphere)`} />
      <path
        d="M54.6 56.7A6.6 6.6 0 1 1 65.4 56.7L66.4 66.5L63.6 66.5L63.6 69.6L66.6 69.6L67.2 76.5L52.8 76.5Z"
        fill="#161616"
        opacity="0.88"
      />
      <ellipse
        cx="44"
        cy="34"
        rx="12"
        ry="7"
        fill="#fff"
        opacity="0.5"
        transform="rotate(-28 44 34)"
      />
    </svg>
  )
}

/**
 * A lime card with a short pitch, an illustration and one black pill. Lives at the foot of the
 * sidebar ("Share a key") or in a bento grid. It carries its own colours, so it reads the same on
 * a dark sidebar and on paper.
 */
export function PromoCard({
  title,
  description,
  action,
  illustration,
  className,
  ...rest
}: PromoCardProps) {
  return (
    <div className={cx(styles.promo, className)} {...rest}>
      <div className={styles.art}>{illustration ?? <PromoOrb />}</div>
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}
