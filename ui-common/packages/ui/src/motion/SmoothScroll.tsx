import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type Lenis from 'lenis'
import { useReducedMotion } from '../internal/use-reduced-motion'

export interface SmoothScrollValue {
  /** The Lenis instance once it has loaded; `null` while loading, when disabled, or under reduced motion. */
  lenis: Lenis | null
  /** True when smooth scrolling is actually running. */
  enabled: boolean
  /** Smooth (or instant, when disabled) scroll to a target: element, selector, or pixel offset. */
  scrollTo: (target: string | number | HTMLElement, options?: { offset?: number }) => void
}

const SmoothScrollContext = createContext<SmoothScrollValue | null>(null)

export interface SmoothScrollProps {
  /** Turn it off without removing the provider (e.g. inside a dashboard). Default true. */
  enabled?: boolean
  /** Lerp factor, 0..1: lower is silkier and slower to settle. Default 0.1. */
  lerp?: number
  children?: ReactNode
}

/**
 * Smooth, inertial page scrolling with Lenis, for marketing pages. Lenis is loaded lazily after
 * first paint, so it never blocks rendering. It switches itself off for people who prefer reduced
 * motion, and `useScrollSmooth()` still works (it falls back to native scrolling).
 */
export function SmoothScroll({ enabled = true, lerp = 0.1, children }: SmoothScrollProps) {
  const reduced = useReducedMotion()
  const active = enabled && !reduced
  const [lenis, setLenis] = useState<Lenis | null>(null)

  useEffect(() => {
    if (!active) return
    let instance: Lenis | null = null
    let cancelled = false
    void import('lenis').then(({ default: LenisCtor }) => {
      if (cancelled) return
      instance = new LenisCtor({ lerp, smoothWheel: true, autoRaf: true })
      setLenis(instance)
    })
    return () => {
      cancelled = true
      instance?.destroy()
      setLenis(null)
    }
  }, [active, lerp])

  const value = useMemo<SmoothScrollValue>(
    () => ({
      lenis,
      enabled: active && lenis !== null,
      scrollTo: (target, options) => {
        if (lenis) lenis.scrollTo(target, options)
        else if (typeof target === 'number') window.scrollTo({ top: target })
        else {
          const el = typeof target === 'string' ? document.querySelector(target) : target
          el?.scrollIntoView()
        }
      },
    }),
    [lenis, active],
  )

  return <SmoothScrollContext.Provider value={value}>{children}</SmoothScrollContext.Provider>
}

const FALLBACK: SmoothScrollValue = {
  lenis: null,
  enabled: false,
  scrollTo: (target) => {
    if (typeof target === 'number') window.scrollTo({ top: target })
    else {
      const el = typeof target === 'string' ? document.querySelector(target) : target
      el?.scrollIntoView()
    }
  },
}

/** Read the smooth-scroll state. Safe without a provider (native scrolling). */
export function useScrollSmooth(): SmoothScrollValue {
  return useContext(SmoothScrollContext) ?? FALLBACK
}
