import { productIds, productVar } from '@platform/tokens'
import { forwardRef, useState, type CSSProperties, type HTMLAttributes } from 'react'
import { cx } from '../../internal/cx'
import styles from './Avatar.module.css'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const PX: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 }

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Full name or email. Used for the initials, the color and the accessible name. */
  name: string
  /** Image URL. If it fails to load, the initials show instead. */
  src?: string | undefined
  size?: AvatarSize
  shape?: 'circle' | 'square'
  /** Hide from assistive tech when the name is written next to the avatar. */
  decorative?: boolean
}

/** "Priya Raman" -> "PR", "sam" -> "S", "alex.k@example.com" -> "AK". */
export function initialsOf(name: string): string {
  const base = name.includes('@') ? (name.split('@')[0] ?? '') : name
  const words = base
    .split(/[\s._-]+/)
    .map((w) => w.trim())
    .filter(Boolean)
  if (words.length === 0) return '?'
  const first = Array.from(words[0] ?? '')[0] ?? ''
  const last = words.length > 1 ? (Array.from(words[words.length - 1] ?? '')[0] ?? '') : ''
  return `${first}${last}`.toUpperCase() || '?'
}

/** Stable color from the name: one of the six product tints, so a list of people has variety without a seventh palette. */
export function avatarProduct(name: string): (typeof productIds)[number] {
  let hash = 0
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return productIds[hash % productIds.length] ?? 'consent'
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { name, src, size = 'md', shape = 'circle', decorative = false, className, style, ...rest },
  ref,
) {
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = Boolean(src) && failed !== src
  const product = avatarProduct(name)
  const vars = {
    '--_size': `${PX[size]}px`,
    '--_bg': productVar(product, 'subtle'),
    '--_fg': productVar(product, 'text'),
  } as CSSProperties
  return (
    <span
      ref={ref}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative ? true : undefined}
      data-size={size}
      className={cx(styles.avatar, shape === 'square' && styles.square, className)}
      style={{ ...vars, ...style }}
      {...rest}
    >
      {showImage ? (
        <img
          className={styles.image}
          src={src}
          alt=""
          onError={() => setFailed(src ?? null)}
          draggable={false}
        />
      ) : (
        <span className={styles.initials} aria-hidden="true">
          {initialsOf(name)}
        </span>
      )}
    </span>
  )
})
