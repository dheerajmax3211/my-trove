import { forwardRef, type ElementType, type HTMLAttributes } from 'react'
import { cx } from '../../internal/cx'
import styles from './Container.module.css'

export type ContainerSize = 'narrow' | 'content' | 'wide' | 'full'

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  /**
   * `narrow` 44rem (reading), `content` 72rem (default, dashboards and marketing),
   * `wide` 82rem (galleries, hero compositions), `full` no max width. Gutters are 16/24/40px.
   */
  size?: ContainerSize
  as?: Extract<ElementType, 'div' | 'main' | 'article' | 'header' | 'footer' | 'nav' | 'section'>
}

/** Centered, gutter-aware page width. The only place page max-width and side padding are set. */
export const Container = forwardRef<HTMLElement, ContainerProps>(function Container(
  { size = 'content', as: Tag = 'div', className, ...rest },
  ref,
) {
  return (
    <Tag ref={ref as never} className={cx(styles.container, styles[size], className)} {...rest} />
  )
})
