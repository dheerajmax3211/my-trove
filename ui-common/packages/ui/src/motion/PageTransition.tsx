import { AnimatePresence, m } from 'motion/react'
import type { ReactNode } from 'react'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { MotionScope } from './MotionScope'

export interface PageTransitionProps {
  /** Changes when the page changes, usually `location.pathname`. */
  routeKey: string
  className?: string
  children?: ReactNode
}

/**
 * A short, tasteful route transition: the old page fades and drops 6px, the new one rises 10px
 * into place (about 200ms in total). Wrap the routed outlet:
 *
 * ```tsx
 * const outlet = useOutlet()
 * <PageTransition routeKey={location.pathname}>{outlet}</PageTransition>
 * ```
 *
 * Pass the element from `useOutlet()` (not `<Outlet />`) so the exiting page keeps its own
 * content while it leaves. Reduced motion swaps pages with no animation.
 */
export function PageTransition({ routeKey, className, children }: PageTransitionProps) {
  const reduced = useReducedMotion()
  if (reduced) {
    return (
      <div key={routeKey} className={className}>
        {children}
      </div>
    )
  }
  return (
    <MotionScope>
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={routeKey}
          className={className}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }}
        >
          {children}
        </m.div>
      </AnimatePresence>
    </MotionScope>
  )
}
