import { productVar, type ProductId } from '@platform/tokens'
import type { ComponentType, CSSProperties, HTMLAttributes } from 'react'
import { cx } from '../../internal/cx'
import {
  ChatSparkIcon,
  CoinsIcon,
  FolderIcon,
  HourglassIcon,
  PulseHomeIcon,
  SettingsIcon,
  ShieldIcon,
  TreeIcon,
  type IconProps,
} from '../../internal/icons'
import styles from './ProductMark.module.css'

/** The six products plus the two workspace modules that are not products. */
export type ProductMarkId = ProductId | 'core' | 'admin'

const GLYPHS: Record<ProductMarkId, ComponentType<IconProps>> = {
  'waiting-on': HourglassIcon,
  consent: ShieldIcon,
  'home-pulse': PulseHomeIcon,
  'ask-your-life': ChatSparkIcon,
  'digital-legacy': TreeIcon,
  'family-treasury': CoinsIcon,
  core: FolderIcon,
  admin: SettingsIcon,
}

/** `core` borrows the brand patina; `admin` is brass (it holds the keys). */
function palette(id: ProductMarkId): { accent: string; subtle: string; text: string; on: string } {
  if (id === 'core') {
    return {
      accent: productVar('consent'),
      subtle: productVar('consent', 'subtle'),
      text: productVar('consent', 'text'),
      on: productVar('consent', 'on'),
    }
  }
  if (id === 'admin') {
    return {
      accent: 'var(--pp-color-brass)',
      subtle: 'var(--pp-color-brass-subtle)',
      text: 'var(--pp-color-brass-text)',
      on: 'var(--pp-color-vault)',
    }
  }
  return {
    accent: productVar(id),
    subtle: productVar(id, 'subtle'),
    text: productVar(id, 'text'),
    on: productVar(id, 'on'),
  }
}

export type ProductMarkVariant = 'tile' | 'solid' | 'glyph'

export interface ProductMarkProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'title'> {
  product: ProductMarkId
  /** Outer size in px. Default 40. */
  size?: number
  /**
   * `tile`: tinted square with the glyph in the product's text color (default).
   * `solid`: accent fill, glyph in the "on" color. `glyph`: the glyph alone.
   */
  variant?: ProductMarkVariant
  /** Accessible name. Omit when the product name is written next to the mark (decorative). */
  title?: string
}

/**
 * The glyph for a product in that product's accent. Always uses the product's own colors (not the
 * ambient `--pp-color-accent`), so a row of marks in one list keeps six different identities.
 */
export function ProductMark({
  product,
  size = 40,
  variant = 'tile',
  title,
  className,
  style,
  ...rest
}: ProductMarkProps) {
  const Glyph = GLYPHS[product]
  const colors = palette(product)
  const vars = {
    '--_size': `${size}px`,
    '--_accent': colors.accent,
    '--_subtle': colors.subtle,
    '--_text': colors.text,
    '--_on': colors.on,
  } as CSSProperties
  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-product-mark={product}
      className={cx(styles.mark, styles[variant], className)}
      style={{ ...vars, ...style }}
      {...rest}
    >
      <Glyph size={Math.round(size * (variant === 'glyph' ? 1 : 0.55))} />
    </span>
  )
}
