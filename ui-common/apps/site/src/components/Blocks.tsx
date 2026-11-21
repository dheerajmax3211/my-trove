import { Callout, ProductMark, cx, type ProductMarkId } from '@platform/ui'
import type { ReactNode } from 'react'
import type { Capability, TechPiece } from '../content/products'
import styles from './Blocks.module.css'

/** Facts as a definition list: the title on the left, the plain explanation on the right. */
export function Rows({ items }: { items: readonly Capability[] }) {
  return (
    <dl className={styles.rows}>
      {items.map((item) => (
        <div key={item.title} className={styles.row}>
          <dt>{item.title}</dt>
          <dd>{item.text}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A sequence: the numbers mean something here, because each step follows the one before. */
export function Steps({ items }: { items: readonly Capability[] }) {
  return (
    <ol className={styles.steps}>
      {items.map((item, index) => (
        <li key={item.title} className={styles.step}>
          <span className={styles.stepNumber} aria-hidden="true">
            {index + 1}
          </span>
          <h3 className={styles.stepTitle}>{item.title}</h3>
          <p className={styles.stepText}>{item.text}</p>
        </li>
      ))}
    </ol>
  )
}

/** What a technology is, and why this product needs it. */
export function TechList({ items }: { items: readonly TechPiece[] }) {
  return (
    <ul className={styles.tech}>
      {items.map((item) => (
        <li key={item.name} className={styles.techItem}>
          <h3 className={styles.techName}>{item.name}</h3>
          <p>{item.what}</p>
          <p className={styles.techWhy}>{item.why}</p>
        </li>
      ))}
    </ul>
  )
}

/** The honest gaps, in the same visual register as the rest (a brass note, not a warning). */
export function NotYet({
  items,
  title,
  headingId,
}: {
  items: readonly string[]
  title: string
  headingId: string
}) {
  return (
    <div className={styles.notYet}>
      <h2 id={headingId} className={styles.notYetTitle}>
        {title}
      </h2>
      <Callout variant="note">
        <ul className={styles.notYetList}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Callout>
    </div>
  )
}

/**
 * A framed sample of the product, built from the same components the product uses. It is labelled
 * as sample data so nobody mistakes it for a screenshot of a real person's account.
 */
export function PanelFrame({
  product,
  title,
  className,
  children,
}: {
  product: ProductMarkId
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <figure className={cx(styles.panel, className)}>
      <figcaption className={styles.panelBar}>
        <ProductMark product={product} size={28} />
        <span className={styles.panelTitle}>{title}</span>
        <span className={styles.sample}>Sample data</span>
      </figcaption>
      <div className={styles.panelBody}>{children}</div>
    </figure>
  )
}
