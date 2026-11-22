import { LazyMotion, MotionConfig, domMax } from 'motion/react'
import type { ReactNode } from 'react'
import { useReducedMotion } from '../internal/use-reduced-motion'

/**
 * Loads only the `motion` features we use (`m` components + `domMax` for layout) and makes the
 * library honour the user's reduced-motion setting. Every motion-powered primitive wraps itself
 * in this, so apps never need a provider.
 */
export function MotionScope({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>{children}</MotionConfig>
    </LazyMotion>
  )
}
