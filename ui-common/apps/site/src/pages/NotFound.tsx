import { Button, Illustration, Section } from '@platform/ui'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import styles from './NotFound.module.css'

export function NotFound() {
  usePageMeta({
    title: 'Page not found | My-Trove',
    description:
      'This page does not exist. Go back to the My-Trove home page or browse the products.',
    noindex: true,
  })

  return (
    <Section size="lg" aria-labelledby="page-title" container="narrow">
      <div className={styles.wrap}>
        <Illustration name="search" size={240} />
        <h1 id="page-title" className={styles.title}>
          That page is not here
        </h1>
        <p className={styles.lead}>
          The address may be mistyped, or the page may have moved. The products and the platform
          pages are all one click away.
        </p>
        <div className={styles.actions}>
          <Button asChild size="lg">
            <Link to="/">Go to the home page</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/#products">See the six products</Link>
          </Button>
        </div>
      </div>
    </Section>
  )
}
