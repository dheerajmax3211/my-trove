import { AnimatePresence, m } from 'motion/react'
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { motion as motionTokens } from '@platform/tokens'
import { cx } from '../internal/cx'
import { useReducedMotion } from '../internal/use-reduced-motion'
import { MotionScope } from './MotionScope'

export interface AnimatedListProps extends HTMLAttributes<HTMLUListElement> {
  children?: ReactNode
}

/**
 * A list whose items animate in and out as they are added or removed, and slide to close the gap.
 * Children must be `AnimatedListItem`s with stable `key`s.
 */
export const AnimatedList = forwardRef<HTMLUListElement, AnimatedListProps>(function AnimatedList(
  { className, children, ...rest },
  ref,
) {
  return (
    <MotionScope>
      <ul
        ref={ref}
        className={cx(className)}
        style={{ listStyle: 'none', margin: 0, padding: 0 }}
        {...rest}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {children}
        </AnimatePresence>
      </ul>
    </MotionScope>
  )
})

export interface AnimatedListItemProps {
  className?: string
  children?: ReactNode
}

/** One entry of an `AnimatedList`: rises and fades in, shrinks and fades out, springs on reorder. */
export const AnimatedListItem = forwardRef<HTMLLIElement, AnimatedListItemProps>(
  function AnimatedListItem({ className, children }, ref) {
    const reduced = useReducedMotion()
    return (
      <m.li
        ref={ref}
        className={className}
        layout={reduced ? false : 'position'}
        initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={
          reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, transition: { duration: 0.16 } }
        }
        transition={{ type: 'spring', ...motionTokens.spring.smooth }}
      >
        {children}
      </m.li>
    )
  },
)
