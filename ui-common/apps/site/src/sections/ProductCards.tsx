import { ArrowUpRightIcon, ProductMark, Reveal, SpotlightCard, Stagger } from '@platform/ui'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { products } from '../content/products'
import { productPath } from '../routes'
import styles from './ProductCards.module.css'

/**
 * The six products as numbered, full-bleed panels. At rest each shows its number, name and a few
 * words; on hover or keyboard focus a sheet rises with what it does and the hard problem under it.
 * The number is only an order (the order they appear everywhere on the site).
 */
export function ProductCards() {
  return (
    <section
      id="products"
      className={`st-dark ${styles.section}`}
      data-theme="dark"
      aria-labelledby="products-title"
    >
      <div className={`st-wrap ${styles.head}`}>
        <Reveal className="st-head">
          <h2 id="products-title" className="st-h2">
            Six products, each for one kind of paperwork
          </h2>
          <p className="st-lead">
            They share a sign-in, a look and a platform. Each also rests on one piece of heavy
            engineering that a spreadsheet could not do.
          </p>
        </Reveal>
      </div>

      <Stagger as="ul" className={styles.grid} interval={0.09} distance={40} duration={0.9}>
        {products.map((product, i) => (
          <li key={product.id} className={styles.item}>
            <SpotlightCard
              tilt={0}
              radius={420}
              className={styles.card}
              style={{ '--accent': `var(--pp-color-product-${product.id})` } as CSSProperties}
            >
              <span className={styles.num} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className={styles.mark}>
                <ProductMark product={product.id} size={48} variant="solid" />
              </span>

              <div className={styles.foot}>
                <h3 className={styles.name}>
                  <Link to={productPath(product.id)} className={styles.link}>
                    {product.name}
                  </Link>
                </h3>
                <p className={styles.tagline}>{product.tagline}</p>
              </div>

              <div className={styles.sheet}>
                <p className={styles.summary}>{product.summary}</p>
                <p className={styles.hard}>
                  <span className={styles.hardLabel}>Under the hood</span>
                  {product.hardPart}
                </p>
                <span className={styles.go} aria-hidden="true">
                  <ArrowUpRightIcon size={20} />
                </span>
              </div>
            </SpotlightCard>
          </li>
        ))}
      </Stagger>
    </section>
  )
}
