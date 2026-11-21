import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import { Container, type ContainerSize } from '../Container/Container'
import { KeyCut, VaultRings } from '../Pattern/Pattern'
import styles from './Section.module.css'

export type SectionTone = 'plain' | 'paper' | 'sunken' | 'vault'
export type SectionSize = 'sm' | 'md' | 'lg' | 'hero'
export type SectionPattern = 'none' | 'rings' | 'keycut'

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /**
   * `plain` sits on the canvas, `paper` is a lighter surface with paper grain, `sunken` is a well,
   * `vault` is the dark ink band (text and accents remap to the vault palette automatically).
   */
  tone?: SectionTone
  /** Vertical rhythm: sm 48px, md 80px, lg 128px, hero 160px on wide screens (less on phones). */
  size?: SectionSize
  /** Width of the inner container, or `false` to render children full-bleed. Default `content`. */
  container?: ContainerSize | false
  /** `rings` draws the vault dial behind the content (hero), `keycut` rules the bottom edge. */
  pattern?: SectionPattern
  as?: Extract<ElementType, 'section' | 'div' | 'header' | 'footer' | 'aside'>
}

/**
 * A full-width band of a page. Marketing pages are a stack of sections; dashboards use `plain`
 * sections to space their groups. Give it `aria-labelledby` pointing at its heading (or an
 * `aria-label`) so it is a named landmark.
 */
export const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  {
    tone = 'plain',
    size = 'md',
    container = 'content',
    pattern = 'none',
    as: Tag = 'section',
    className,
    children,
    ...rest
  },
  ref,
) {
  const vault = tone === 'vault'
  return (
    <Tag
      ref={ref as never}
      data-surface={vault ? 'vault' : undefined}
      data-tone={tone}
      className={cx(
        styles.section,
        styles[tone],
        styles[size],
        (tone === 'paper' || vault) && 'pp-grain',
        className,
      )}
      {...rest}
    >
      {pattern === 'rings' ? <VaultRings animate className={styles.rings} /> : null}
      {container === false ? (
        <div className={styles.inner}>{children}</div>
      ) : (
        <Container size={container} className={styles.inner}>
          {children}
        </Container>
      )}
      {pattern === 'keycut' ? <KeyCut className={styles.keycut} /> : null}
    </Tag>
  )
})

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** A short, plain label above the title (a place or a product), set in sentence case. */
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Heading element. Use `h1` once per page, `h2` for section titles. Default h2. */
  as?: Extract<ElementType, 'h1' | 'h2' | 'h3'>
  /** `hero` is the page opener, `lg` a major section, `md` a sub-section. Default lg. */
  scale?: 'hero' | 'lg' | 'md'
  align?: 'start' | 'center'
  /** Buttons under the description. */
  actions?: ReactNode
  /** id for the heading, so a Section can reference it with aria-labelledby. */
  headingId?: string
}

/** Eyebrow, headline, standfirst and actions, with the display face and measure set for you. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  as: Heading = 'h2',
  scale = 'lg',
  align = 'start',
  actions,
  headingId,
  className,
  ...rest
}: SectionHeaderProps) {
  return (
    <div className={cx(styles.header, styles[`align-${align}`], className)} {...rest}>
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <Heading id={headingId} className={cx(styles.title, styles[`scale-${scale}`])}>
        {title}
      </Heading>
      {description ? <p className={styles.description}>{description}</p> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  )
}
