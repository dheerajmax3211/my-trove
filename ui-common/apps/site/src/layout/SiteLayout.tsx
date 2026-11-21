import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Footer } from './Footer'
import { Header } from './Header'
import styles from './SiteLayout.module.css'

/**
 * Skip link, sticky header, the page, footer. On every navigation after the first it scrolls to
 * the top (or to the `#hash` target) and moves focus to the page, so keyboard and screen reader
 * users start at the new content instead of in the header.
 */
export function SiteLayout() {
  const { pathname, hash, key } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const first = useRef(true)

  useEffect(() => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null
    if (target) {
      target.scrollIntoView()
    } else {
      window.scrollTo(0, 0)
    }
    if (first.current) {
      first.current = false
      return
    }
    ;(target ?? mainRef.current)?.focus({ preventScroll: true })
  }, [pathname, hash, key])

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Skip to the content
      </a>
      <Header />
      <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
