import { Logo, Reveal } from '@platform/ui'
import { Link } from 'react-router-dom'
import { demoUrl, repoUrl, workspaceUrl } from '../config'
import { products } from '../content/products'
import { productPath } from '../routes'
import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer} data-theme="dark">
      <div className={`st-wrap ${styles.inner}`}>
        <div className={styles.top}>
          <Reveal className={styles.about}>
            <Logo size="lg" tone="inverse" title="My-Trove" />
            <p className={styles.line}>A vault you can lend from.</p>
            <p className={styles.fine}>
              A portfolio project. Billing is simulated, nobody is charged, and nothing here moves
              real money or sends real email.
            </p>
          </Reveal>

          <nav className={styles.cols} aria-label="Footer">
            <div>
              <h2 className={styles.heading}>Products</h2>
              <ul className={styles.list}>
                {products.map((product) => (
                  <li key={product.id}>
                    <Link to={productPath(product.id)}>{product.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className={styles.heading}>Platform</h2>
              <ul className={styles.list}>
                <li>
                  <Link to="/platform">How it fits together</Link>
                </li>
                <li>
                  <Link to="/security">Security</Link>
                </li>
                <li>
                  <Link to="/pricing">Plans and limits</Link>
                </li>
                <li>
                  <Link to="/docs">Docs</Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className={styles.heading}>Project</h2>
              <ul className={styles.list}>
                <li>
                  <Link to="/about">About</Link>
                </li>
                <li>
                  <a href={repoUrl()}>Source code</a>
                </li>
                <li>
                  <a href={workspaceUrl()}>Open the workspace</a>
                </li>
                <li>
                  <a href={demoUrl()}>Try the live demo</a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
        <p className={styles.mega} aria-hidden="true">
          My-Trove
        </p>
      </div>
    </footer>
  )
}
