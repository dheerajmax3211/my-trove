import {
  ArrowRightIcon,
  Button,
  CheckIcon,
  ProductMark,
  Reveal,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@platform/ui'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { products, type ProductId } from '../content/products'
import { ProductPreview } from '../panels/ProductPreview'
import { productPath } from '../routes'
import styles from './Showcase.module.css'

/** A product switcher: pick a product, see what its dashboard looks like. */
export function Showcase() {
  const [tab, setTab] = useState<ProductId>('consent')
  return (
    <section
      id="showcase"
      className={`st-section ${styles.section}`}
      aria-labelledby="showcase-title"
    >
      <div className="st-wrap">
        <Reveal className="st-head">
          <h2 id="showcase-title" className="st-h2">
            Look inside each one
          </h2>
          <p className="st-lead">
            Every product opens onto a dashboard built from the same parts. These are samples with
            invented numbers, drawn from what each service really does.
          </p>
        </Reveal>

        <Tabs value={tab} onValueChange={(value) => setTab(value as ProductId)}>
          <div className={styles.listWrap}>
            <TabsList aria-label="Products" className={styles.list}>
              {products.map((p) => (
                <TabsTrigger key={p.id} value={p.id}>
                  {p.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {products.map((p) => (
            <TabsContent key={p.id} value={p.id} className={styles.content}>
              <div className={styles.panel} data-product={p.id}>
                <div className={styles.copy}>
                  <ProductMark product={p.id} size={56} variant="solid" />
                  <h3 className={styles.headline}>{p.headline}</h3>
                  <p className={styles.summary}>{p.summary}</p>
                  <ul className={styles.does}>
                    {p.does.slice(0, 3).map((item) => (
                      <li key={item.title}>
                        <CheckIcon size={18} aria-hidden="true" />
                        {item.title}
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant="primary" size="lg">
                    <Link to={productPath(p.id)}>
                      See {p.name}
                      <ArrowRightIcon size={18} aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
                <ProductPreview id={p.id} className={styles.preview} />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  )
}
