import {
  forwardRef,
  useId,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { cx } from '../internal/cx'
import { MoreIcon } from '../internal/icons'
import { Stagger, type StaggerProps } from '../motion/Reveal'
import { RoundIconButton } from './RoundIconButton'
import styles from './Bento.module.css'

export interface BentoGridProps extends Omit<StaggerProps, 'as'> {
  /** Number of columns on wide screens. Default 12. Cards choose how many they span. */
  columns?: 6 | 8 | 12
  /** Entrance: cards rise in one after another. Default true. */
  animate?: boolean
  as?: ElementType
}

/**
 * A 12-column bento grid. Cards declare `span` (1-12) and `rowSpan`; on tablets everything becomes
 * two columns and on phones one. The cards enter in a stagger as the grid scrolls into view.
 */
export function BentoGrid({
  columns = 12,
  animate = true,
  className,
  children,
  ...rest
}: BentoGridProps) {
  const cls = cx(styles.grid, styles[`cols${columns}`], className)
  if (!animate) {
    return (
      <div className={cls} {...rest}>
        {children}
      </div>
    )
  }
  return (
    <Stagger
      className={cls}
      interval={0.07}
      distance={28}
      scale={0.98}
      duration={0.8}
      amount={0.05}
      {...rest}
    >
      {children}
    </Stagger>
  )
}

export type BentoTone = 'light' | 'dark' | 'lime' | 'lilac'

export interface BentoCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Card title, shown next to the icon chip. */
  title: ReactNode
  /** Icon inside the round chip on the left of the title. */
  icon?: ReactNode
  /** Replace the default three-dot menu button, or `null` for none. */
  menu?: ReactNode
  /** Called when the default three-dot button is pressed. Without it the button is omitted. */
  onMenu?: () => void
  tone?: BentoTone
  /** Columns to span in the 12-column grid. Default 4. */
  span?: number
  /** Rows to span. Default 1. */
  rowSpan?: number
  /** Right of the title row, before the menu (a pill select, a badge). */
  actions?: ReactNode
  /** Space inside the card. Default `md` (28px). */
  padding?: 'md' | 'lg' | 'none'
}

/**
 * A white (or black, lime, lilac) rounded card with the dashboard header: round icon chip, title
 * and a three-dot menu. Put a `BigStat`, a chart or a list in it.
 */
export const BentoCard = forwardRef<HTMLElement, BentoCardProps>(function BentoCard(
  {
    title,
    icon,
    menu,
    onMenu,
    tone = 'light',
    span = 4,
    rowSpan = 1,
    actions,
    padding = 'md',
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const titleId = useId()
  const menuNode =
    menu !== undefined ? (
      menu
    ) : onMenu ? (
      <RoundIconButton
        label={`${typeof title === 'string' ? title : 'Card'} options`}
        icon={<MoreIcon size={18} />}
        tone="plain"
        size="sm"
        onClick={onMenu}
      />
    ) : null
  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      data-surface={tone === 'dark' ? 'vault' : undefined}
      className={cx(
        styles.card,
        styles[tone],
        span >= 6 && styles.wide,
        padding !== 'md' && styles[`pad-${padding}`],
        className,
      )}
      style={
        {
          '--_span': span,
          '--_rows': rowSpan,
          ...style,
        } as CSSProperties
      }
      {...rest}
    >
      <header className={styles.header}>
        {icon ? (
          <span className={styles.chip} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
        <div className={styles.headerEnd}>
          {actions}
          {menuNode}
        </div>
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  )
})
