import { Fragment, type CSSProperties, type ElementType, type HTMLAttributes } from 'react'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import styles from './SplitText.module.css'
import { useInView } from './use-in-view'

export interface SplitTextProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** The headline. With `by="line"`, separate lines with `\n`. */
  children: string
  /** Reveal word by word (default) or line by line. */
  by?: 'word' | 'line'
  /** Element to render. Default `span`; pass `h1`/`h2` to make it the heading itself. */
  as?: ElementType
  /** Seconds before the first unit. */
  delay?: number
  /** Seconds between units. Default 0.06 for words, 0.12 for lines. */
  interval?: number
  /** Start on mount instead of when scrolled into view. Use for the hero headline. */
  immediate?: boolean
}

/**
 * Headline reveal: each word (or line) rises out of a mask. The full text is exposed once to
 * assistive tech via `aria-label`; the split spans are hidden from it. Under reduced motion the
 * headline is simply set.
 */
export function SplitText({
  children,
  by = 'word',
  as: Tag = 'span',
  delay = 0,
  interval,
  immediate = false,
  className,
  style,
  ...rest
}: SplitTextProps) {
  const reduced = useReducedMotion()
  const [ref, inView] = useInView<HTMLElement>({ disabled: reduced || immediate, amount: 0.3 })
  const step = interval ?? (by === 'word' ? 0.06 : 0.12)
  const lines = by === 'line' ? children.split('\n') : [children.replace(/\n/g, ' ')]
  let index = 0

  const unit = (text: string) => {
    const i = index++
    return (
      <span
        key={`${i}-${text}`}
        className={styles.mask}
        style={{ '--pp-split-delay': `${delay + i * step}s` } as CSSProperties}
      >
        <span className={styles.inner}>{text}</span>
      </span>
    )
  }

  return (
    <Tag
      ref={ref}
      aria-label={children.replace(/\n/g, ' ')}
      className={cx(styles.split, className)}
      data-revealed={immediate || inView ? 'true' : 'false'}
      style={style as CSSProperties}
      {...rest}
    >
      {by === 'word'
        ? lines[0]!.split(/\s+/).map((word, i, all) => (
            <Fragment key={i}>
              <span aria-hidden="true">{unit(word)}</span>
              {i < all.length - 1 ? ' ' : null}
            </Fragment>
          ))
        : lines.map((line, i) => (
            <span key={i} aria-hidden="true" className={styles.line}>
              {unit(line)}
            </span>
          ))}
    </Tag>
  )
}
