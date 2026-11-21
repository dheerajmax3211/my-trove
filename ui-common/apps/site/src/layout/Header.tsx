import {
  ChevronDownIcon,
  CloseIcon,
  IconButton,
  Logo,
  MenuIcon,
  ProductMark,
  cx,
} from '@platform/ui'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { CtaPair } from '../components/CtaPair'
import { ThemeToggle } from '../components/ThemeToggle'
import { products } from '../content/products'
import { productPath } from '../routes'
import styles from './Header.module.css'

const links = [
  { to: '/platform', label: 'Platform' },
  { to: '/security', label: 'Security' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/docs', label: 'Docs' },
] as const

const navClass = ({ isActive }: { isActive: boolean }) => cx(styles.link, isActive && styles.active)

/**
 * "Products" disclosure. It is a button that reveals a list of links (not an ARIA menu), so Tab
 * moves through the links as it does anywhere else. Escape closes it and returns focus.
 */
function ProductsMenu({ currentKey }: { currentKey: string }) {
  // The menu is open only for the location it was opened on, so navigating closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === currentKey
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { pathname } = useLocation()
  const inProducts = pathname.startsWith('/products/')

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenAt(null)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      setOpenAt(null)
      buttonRef.current?.focus()
    }
  }

  return (
    // Key and blur events bubble up from the real button and links inside; the div itself is not a control.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={rootRef}
      className={styles.menuRoot}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpenAt(null)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={cx(styles.link, styles.menuButton, inProducts && styles.active)}
        aria-expanded={open}
        aria-controls="products-menu"
        onClick={() => setOpenAt(open ? null : currentKey)}
      >
        Products
        <ChevronDownIcon size={16} className={cx(styles.chevron, open && styles.chevronOpen)} />
      </button>
      {open ? (
        <div id="products-menu" className={styles.panel}>
          <ul className={styles.productList}>
            {products.map((product) => (
              <li key={product.id}>
                <Link to={productPath(product.id)} className={styles.productLink}>
                  <ProductMark product={product.id} size={36} />
                  <span>
                    <span className={styles.productName}>{product.name}</span>
                    <span className={styles.productTagline}>{product.tagline}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/#products" className={styles.allProducts}>
            Compare all six on one page
          </Link>
        </div>
      ) : null}
    </div>
  )
}

export function Header() {
  const location = useLocation()
  const [mobileOpenAt, setMobileOpenAt] = useState<string | null>(null)
  const mobileOpen = mobileOpenAt === location.key

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpenAt(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link to="/" className={styles.brand} aria-label="My-Trove, home">
          <Logo size="md" title="" />
        </Link>

        <nav className={styles.nav} aria-label="Main">
          <ProductsMenu currentKey={location.key} />
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className={navClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.actions}>
          <ThemeToggle />
          <span className={styles.ctas}>
            <CtaPair size="sm" />
          </span>
          <IconButton
            className={styles.burger}
            label={mobileOpen ? 'Close the menu' : 'Open the menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            icon={mobileOpen ? <CloseIcon /> : <MenuIcon />}
            onClick={() => setMobileOpenAt(mobileOpen ? null : location.key)}
          />
        </div>
      </div>

      {mobileOpen ? (
        <nav id="mobile-nav" className={styles.mobile} aria-label="Menu">
          <p className={styles.mobileHeading}>Products</p>
          <ul className={styles.mobileProducts}>
            {products.map((product) => (
              <li key={product.id}>
                <Link to={productPath(product.id)} className={styles.mobileProduct}>
                  <ProductMark product={product.id} size={32} />
                  {product.name}
                </Link>
              </li>
            ))}
          </ul>
          <ul className={styles.mobileLinks}>
            {links.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} className={styles.mobileLink}>
                  {link.label}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink to="/about" className={styles.mobileLink}>
                About
              </NavLink>
            </li>
          </ul>
          <div className={styles.mobileCtas}>
            <CtaPair size="lg" />
          </div>
        </nav>
      ) : null}
    </header>
  )
}
