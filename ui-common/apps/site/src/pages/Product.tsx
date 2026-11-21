import { ProductMark, Section, SectionHeader } from '@platform/ui'
import { Link, useParams } from 'react-router-dom'
import { NotYet, Rows, Steps, TechList } from '../components/Blocks'
import { CtaPair } from '../components/CtaPair'
import { getProduct, products, type ProductContent } from '../content/products'
import { usePageMeta } from '../hooks/usePageMeta'
import { ProductPanel } from '../panels/Panels'
import { productPath } from '../routes'
import { NotFound } from './NotFound'
import styles from './Product.module.css'

export function Product() {
  const { id = '' } = useParams()
  const product = getProduct(id)
  if (!product) return <NotFound />
  return <ProductPage product={product} />
}

function ProductPage({ product }: { product: ProductContent }) {
  const index = products.findIndex((p) => p.id === product.id)
  const previous = products[(index + products.length - 1) % products.length]
  const next = products[(index + 1) % products.length]

  usePageMeta({
    title: `${product.name}: ${product.tagline.toLowerCase()} | My-Trove`,
    description: product.metaDescription,
  })

  if (!previous || !next) return null

  return (
    <div data-product={product.id}>
      <Section size="md" aria-labelledby="product-title" className={styles.hero}>
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <Link to="/#products">Products</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{product.name}</span>
        </nav>
        <div className={styles.heroGrid}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>
              <ProductMark product={product.id} size={32} />
              {product.name}
            </p>
            <h1 id="product-title" className={styles.title}>
              {product.headline}
            </h1>
            <p className={styles.lead}>{product.lead}</p>
            <div className={styles.actions}>
              <CtaPair size="lg" />
            </div>
          </div>
          <ProductPanel id={product.id} />
        </div>
      </Section>

      <Section size="md" aria-labelledby="does-title">
        <div className={styles.twoCol}>
          <SectionHeader headingId="does-title" scale="md" title="What it does" />
          <Rows items={product.does} />
        </div>
      </Section>

      <Section tone="paper" size="md" aria-labelledby="how-title">
        <SectionHeader headingId="how-title" scale="md" title="How it works" />
        <div className={styles.below}>
          <Steps items={product.steps} />
        </div>
      </Section>

      <Section size="md" aria-labelledby="tech-title">
        <SectionHeader
          headingId="tech-title"
          scale="md"
          title="The engineering, plainly"
          description="What it is built on, and why the product needs it."
        />
        <div className={styles.below}>
          <TechList items={product.tech} />
        </div>
      </Section>

      <Section size="sm" aria-labelledby="not-yet-title" className={styles.notYetSection}>
        <NotYet headingId="not-yet-title" title="What it does not do yet" items={product.notYet} />
      </Section>

      <Section tone="sunken" size="md" aria-labelledby="more-title">
        <h2 id="more-title" className={styles.moreTitle}>
          Try {product.name}, or look at another product
        </h2>
        <div className={styles.moreActions}>
          <CtaPair size="md" />
        </div>
        <nav aria-label="Other products" className={styles.pager}>
          <Link
            to={productPath(previous.id)}
            className={styles.pagerLink}
            data-product={previous.id}
          >
            <ProductMark product={previous.id} size={36} />
            <span>
              <span className={styles.pagerHint}>Previous</span>
              {previous.name}
            </span>
          </Link>
          <Link to={productPath(next.id)} className={styles.pagerLink} data-product={next.id}>
            <ProductMark product={next.id} size={36} />
            <span>
              <span className={styles.pagerHint}>Next</span>
              {next.name}
            </span>
          </Link>
        </nav>
      </Section>
    </div>
  )
}
