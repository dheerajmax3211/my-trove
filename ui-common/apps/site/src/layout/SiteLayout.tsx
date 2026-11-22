import { PageTransition, ScrollProgress, SmoothScroll, useScrollSmooth } from '@platform/ui'
import { useEffect, useRef } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AccessibilityPanel } from '../a11y/AccessibilityPanel'
import { PlaybackProvider } from '../motion/playback'
import { Announcement } from './Announcement'
import { Footer } from './Footer'
import { Header } from './Header'
import styles from './SiteLayout.module.css'

/** Where a navigation lands: the top, or the `#hash` target. Needs the smooth-scroll context. */
function Shell() {
  const { pathname, hash, key } = useLocation()
  const outlet = useOutlet()
  const { lenis } = useScrollSmooth()
  const mainRef = useRef<HTMLElement>(null)
  const first = useRef(true)
  // Read through a ref: Lenis arrives after first paint and must not re-run the scroll below.
  const lenisRef = useRef(lenis)
  useEffect(() => {
    lenisRef.current = lenis
  }, [lenis])

  useEffect(() => {
    const lenis = lenisRef.current
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null
    if (target) {
      if (lenis) lenis.scrollTo(target, { offset: -72, immediate: first.current })
      else target.scrollIntoView()
    } else if (lenis) {
      lenis.scrollTo(0, { immediate: true })
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
      <ScrollProgress />
      <a className={styles.skip} href="#main">
        Skip to the content
      </a>
      <Announcement />
      <Header />
      <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
        <PageTransition routeKey={pathname}>{outlet}</PageTransition>
      </main>
      <Footer />
      <AccessibilityPanel />
    </div>
  )
}

/**
 * Skip link, announcement, floating header, the page (with a short route transition), footer and
 * the accessibility panel, all inside inertial smooth scrolling. On every navigation after the
 * first it scrolls to the top (or to the `#hash` target) and moves focus to the page, so keyboard
 * and screen reader users start at the new content instead of in the header.
 */
export function SiteLayout() {
  return (
    <SmoothScroll>
      <PlaybackProvider>
        <Shell />
      </PlaybackProvider>
    </SmoothScroll>
  )
}
